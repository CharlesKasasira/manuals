import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AssetKind, AssetScanStatus, Prisma, Role, Visibility } from "@prisma/client";
import { createReadStream, mkdirSync } from "node:fs";
import { AuditService } from "../common/audit.service";
import { ManualsService } from "../manuals/manuals.service";
import { PrismaService } from "../prisma/prisma.service";

type Actor = { id: string; role: Role } | null;

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly manuals: ManualsService
  ) {}

  async list(user: Actor) {
    return this.prisma.asset.findMany({
      where: this.assetReadableWhere(user),
      include: { usages: true, uploadedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async upload(user: Actor, file: Express.Multer.File, visibility: Visibility = Visibility.internal) {
    this.assertManager(user);
    if (!file) throw new NotFoundException("No file uploaded.");
    const root = this.config.get("UPLOAD_ROOT", "./uploads");
    mkdirSync(root, { recursive: true });
    const asset = await this.prisma.asset.create({
      data: {
        fileName: file.originalname,
        storagePath: file.path,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        kind: this.detectKind(file.mimetype),
        visibility,
        uploadedById: user.id
      }
    });
    await this.scanAsset(asset.id, file);
    await this.audit.record({ event: "asset_uploaded", actorId: user.id, entityType: "asset", entityId: asset.id });
    return this.prisma.asset.findUnique({ where: { id: asset.id } });
  }

  async download(user: Actor, id: string) {
    const asset = await this.requireAssetReadable(user, id);
    return { stream: createReadStream(asset.storagePath), fileName: asset.fileName, mimeType: asset.mimeType ?? "application/octet-stream" };
  }

  async usages(user: Actor, id: string) {
    if (!user) throw new ForbiddenException("Authentication required.");
    await this.requireAssetReadable(user, id);
    return this.prisma.assetUsage.findMany({
      where: {
        assetId: id,
        OR: [
          { manualId: null },
          { manual: { is: this.manuals.readableManualWhere(user) } }
        ]
      },
      include: { manual: true, page: true }
    });
  }

  async remove(user: Actor, id: string) {
    if (!user) throw new ForbiddenException("Authentication required.");
    await this.requireAssetWritable(user, id);
    await this.prisma.asset.delete({ where: { id } });
    await this.audit.record({ event: "asset_deleted", actorId: user.id, entityType: "asset", entityId: id });
    return { ok: true };
  }

  detectKind(mime = ""): AssetKind {
    if (mime.startsWith("image/")) return AssetKind.image;
    if (mime.startsWith("video/")) return AssetKind.video;
    if (mime.includes("pdf") || mime.includes("word") || mime.includes("spreadsheet")) return AssetKind.document;
    if (mime.includes("json") || mime.includes("yaml") || mime.includes("xml")) return AssetKind.config;
    return AssetKind.other;
  }

  assetReadableWhere(user: Actor): Prisma.AssetWhereInput {
    if (user?.role === Role.admin) return {};
    if (!user) return { visibility: Visibility.public };

    return {
      OR: [
        { visibility: { in: [Visibility.public, Visibility.internal] } },
        { uploadedById: user.id },
        {
          usages: {
            some: {
              manual: { is: this.manuals.readableManualWhere(user) }
            }
          }
        }
      ]
    };
  }

  async requireAssetReadable(user: Actor, id: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id, AND: [this.assetReadableWhere(user)] } });
    if (!asset) throw new NotFoundException("Asset not found.");
    return asset;
  }

  async requireAssetWritable(user: NonNullable<Actor>, id: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: { usages: { select: { manualId: true } } }
    });
    if (!asset) throw new NotFoundException("Asset not found.");
    if (user.role === Role.admin || asset.uploadedById === user.id) return asset;

    for (const usage of asset.usages) {
      if (!usage.manualId) continue;
      try {
        await this.manuals.requireManualForWrite(user, usage.manualId);
        return asset;
      } catch {
        // Continue checking other linked manuals before denying access.
      }
    }

    throw new ForbiddenException("You cannot modify this asset.");
  }

  assertManager(user: Actor): asserts user is NonNullable<Actor> {
    if (!user || (user.role !== Role.admin && user.role !== Role.manager)) throw new ForbiddenException("Manager or admin access required.");
  }

  async scanAsset(assetId: string, file: Express.Multer.File) {
    const webhookUrl = this.config.get<string>("ASSET_SCAN_WEBHOOK_URL");
    if (!webhookUrl) {
      await this.prisma.asset.update({
        where: { id: assetId },
        data: { scanStatus: AssetScanStatus.clean, scanDetails: { provider: "local-hook", verdict: "skipped", reason: "ASSET_SCAN_WEBHOOK_URL not configured" } }
      });
      return;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, fileName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, storagePath: file.path })
      });
      const details = await response.json().catch(() => ({ status: response.status }));
      const verdict = String(details.verdict ?? details.status ?? "").toLowerCase();
      const scanStatus = verdict.includes("flag") || verdict.includes("infect") || verdict.includes("malware") ? AssetScanStatus.flagged : AssetScanStatus.clean;
      await this.prisma.asset.update({ where: { id: assetId }, data: { scanStatus, scanDetails: details as Prisma.InputJsonValue } });
    } catch (error) {
      await this.prisma.asset.update({
        where: { id: assetId },
        data: { scanStatus: AssetScanStatus.failed, scanDetails: { provider: "webhook", error: error instanceof Error ? error.message : "Scan failed" } }
      });
    }
  }
}
