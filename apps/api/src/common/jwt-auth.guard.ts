import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC_KEY } from "./public.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly apiKeyHits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization ?? "";
    const apiKey = this.extractApiKey(request.headers);

    if (apiKey) {
      const user = await this.userForApiKey(apiKey);
      if (user) {
        if (!this.withinApiKeyRateLimit(user.apiKeyId, user.rateLimitPerMinute)) return false;
        request.user = user;
        return true;
      }
      return Boolean(isPublic);
    }

    const token = header.startsWith("Bearer ") ? header.slice(7) : this.extractCookieToken(request.headers.cookie);
    if (!token) return Boolean(isPublic);

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>("JWT_SECRET", "manualflow-dev-secret")
      });
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, isActive: true },
        select: { id: true, email: true, name: true, role: true, isActive: true }
      });
      request.user = user;
      return Boolean(user) || Boolean(isPublic);
    } catch {
      return Boolean(isPublic);
    }
  }

  extractApiKey(headers: Record<string, string | string[] | undefined>) {
    const headerValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
    const explicit = headerValue(headers["x-api-key"]);
    if (explicit) return explicit.trim();

    const authorization = headerValue(headers.authorization);
    if (!authorization) return null;

    if (authorization.startsWith("ApiKey ")) return authorization.slice(7).trim();
    if (authorization.startsWith("Api-Key ")) return authorization.slice(8).trim();
    if (authorization.startsWith("Bearer mfk_")) return authorization.slice(7).trim();

    return null;
  }

  extractCookieToken(cookieHeader?: string) {
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(";").map((part) => part.trim());
    const tokenCookie = cookies.find((part) => part.startsWith("manualflow.token="));
    if (!tokenCookie) return null;
    return decodeURIComponent(tokenCookie.slice("manualflow.token=".length));
  }

  async userForApiKey(key: string) {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: "apiAccess.enabled" } });
    const enabled = Boolean(setting?.value && typeof setting.value === "object" && "enabled" in setting.value && (setting.value as { enabled?: unknown }).enabled === true);
    if (!enabled) return null;

    const now = new Date();
    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        keyHash: createHash("sha256").update(key).digest("hex"),
        isActive: true,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
      },
      select: {
        id: true,
        name: true,
        role: true,
        rateLimitPerMinute: true,
        createdBy: { select: { id: true, email: true, isActive: true, deletedAt: true } }
      }
    });
    if (!apiKey?.createdBy?.isActive || apiKey.createdBy.deletedAt) return null;

    await this.prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: now } });

    return {
      id: apiKey.createdBy.id,
      email: apiKey.createdBy.email,
      name: apiKey.name,
      role: apiKey.role,
      isActive: true,
      apiKeyId: apiKey.id,
      rateLimitPerMinute: apiKey.rateLimitPerMinute
    };
  }

  withinApiKeyRateLimit(apiKeyId: string, limit = 60) {
    const now = Date.now();
    const current = this.apiKeyHits.get(apiKeyId);
    if (!current || now - current.windowStart >= 60_000) {
      this.apiKeyHits.set(apiKeyId, { windowStart: now, count: 1 });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }
}
