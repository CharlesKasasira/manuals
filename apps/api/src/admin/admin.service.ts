import { BadRequestException, Injectable } from "@nestjs/common";
import { PermissionAction, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { AuditService } from "../common/audit.service";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { AddTeamMemberDto, CreateApiKeyDto, CreatePermissionDto, CreateTeamDto, CreateUserDto, MailSettingsDto, SendTestEmailDto, UpdateTeamDto, UpdateUserDto } from "./admin.dto";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly mail: MailService) {}

  async overview() {
    const [users, teams, spaces, permissions, auditLogs, notifications, manuals] = await Promise.all([
      this.users(),
      this.teams(),
      this.prisma.space.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      this.permissions(),
      this.prisma.auditLog.findMany({
        include: { actor: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 50
      }),
      this.prisma.notificationOutbox.count({ where: { sentAt: null } }),
      this.prisma.manual.findMany({ select: { id: true, title: true, slug: true }, orderBy: { title: "asc" }, take: 200 })
    ]);

    return {
      users,
      teams,
      spaces,
      permissions,
      auditLogs,
      manuals,
      roles: Object.values(Role),
      permissionActions: Object.values(PermissionAction),
      apiAccess: await this.apiAccess(),
      mailSettings: await this.mailSettings(),
      pendingNotifications: notifications,
      roleCounts: users.reduce<Record<string, number>>((counts, user) => {
        counts[user.role] = (counts[user.role] ?? 0) + 1;
        return counts;
      }, {})
    };
  }

  users() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        teamMemberships: { include: { team: { select: { id: true, name: true, slug: true } } } }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async createUser(actorId: string, dto: CreateUserDto) {
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        isActive: dto.isActive ?? true,
        passwordHash: await bcrypt.hash(dto.password, 12)
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }
    });
    await this.audit.record({ event: "user_created", actorId, entityType: "user", entityId: user.id, metadata: { email: user.email, role: user.role } });
    return user;
  }

  async updateUser(actorId: string, id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        isActive: dto.isActive,
        passwordHash: dto.password ? await bcrypt.hash(dto.password, 12) : undefined
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true }
    });
    await this.audit.record({ event: dto.role ? "role_updated" : "user_updated", actorId, entityType: "user", entityId: id, metadata: { ...dto } });
    return user;
  }

  async deactivateUser(actorId: string, id: string) {
    const user = await this.prisma.user.update({ where: { id }, data: { isActive: false }, select: { id: true, isActive: true } });
    await this.audit.record({ event: "user_updated", actorId, entityType: "user", entityId: id, metadata: { isActive: false } });
    return user;
  }

  async activateUser(actorId: string, id: string) {
    const user = await this.prisma.user.update({ where: { id }, data: { isActive: true }, select: { id: true, isActive: true } });
    await this.audit.record({ event: "user_updated", actorId, entityType: "user", entityId: id, metadata: { isActive: true } });
    return user;
  }

  async deleteUser(actorId: string, id: string) {
    await this.prisma.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
    await this.audit.record({ event: "user_updated", actorId, entityType: "user", entityId: id, metadata: { deleted: true } });
    return { ok: true };
  }

  teams() {
    return this.prisma.team.findMany({
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, email: true, role: true, isActive: true } } } },
        permissions: { include: { manual: { select: { id: true, title: true, slug: true } } } }
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take: 200
    });
  }

  async createTeam(actorId: string, dto: CreateTeamDto) {
    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        slug: await this.uniqueTeamSlug(this.slugify(dto.name)),
        description: dto.description ?? null,
        ownerId: dto.ownerId || null
      }
    });
    await this.audit.record({ event: "permission_changed", actorId, entityType: "team", entityId: team.id, metadata: { action: "team_created" } });
    return team;
  }

  async updateTeam(actorId: string, id: string, dto: UpdateTeamDto) {
    const team = await this.prisma.team.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.name ? await this.uniqueTeamSlug(this.slugify(dto.name), id) : undefined,
        description: dto.description,
        ownerId: dto.ownerId,
        isActive: dto.isActive
      }
    });
    await this.audit.record({ event: "permission_changed", actorId, entityType: "team", entityId: team.id, metadata: { action: "team_updated" } });
    return team;
  }

  async deleteTeam(actorId: string, id: string) {
    await this.prisma.team.delete({ where: { id } });
    await this.audit.record({ event: "permission_changed", actorId, entityType: "team", entityId: id, metadata: { action: "team_deleted" } });
    return { ok: true };
  }

  async addTeamMember(actorId: string, teamId: string, dto: AddTeamMemberDto) {
    const member = await this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId: dto.userId } },
      update: { role: dto.role ?? "member" },
      create: { teamId, userId: dto.userId, role: dto.role ?? "member" }
    });
    await this.audit.record({ event: "permission_changed", actorId, entityType: "team", entityId: teamId, metadata: { action: "member_added", userId: dto.userId } });
    return member;
  }

  async removeTeamMember(actorId: string, teamId: string, userId: string) {
    await this.prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
    await this.audit.record({ event: "permission_changed", actorId, entityType: "team", entityId: teamId, metadata: { action: "member_removed", userId } });
    return { ok: true };
  }

  permissions() {
    return this.prisma.permissionGrant.findMany({
      include: {
        manual: { select: { id: true, title: true, slug: true } },
        user: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true, slug: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async createPermission(actorId: string, dto: CreatePermissionDto) {
    const targetCount = [dto.userId, dto.teamId, dto.role].filter(Boolean).length;
    if (targetCount !== 1) {
      throw new BadRequestException("Choose exactly one permission target: user, team, or role.");
    }
    const permission = await this.prisma.permissionGrant.create({
      data: {
        manualId: dto.manualId,
        action: dto.action,
        userId: dto.userId || null,
        teamId: dto.teamId || null,
        role: dto.role || null
      }
    });
    await this.audit.record({ event: "permission_changed", actorId, entityType: "permission", entityId: permission.id, metadata: { ...dto } });
    return permission;
  }

  async deletePermission(actorId: string, id: string) {
    await this.prisma.permissionGrant.delete({ where: { id } });
    await this.audit.record({ event: "permission_changed", actorId, entityType: "permission", entityId: id, metadata: { deleted: true } });
    return { ok: true };
  }

  async apiAccess() {
    const [setting, keys] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { key: "apiAccess.enabled" } }),
      this.apiKeys()
    ]);
    return {
      enabled: this.settingEnabled(setting?.value),
      keys
    };
  }

  apiKeys() {
    return this.prisma.apiKey.findMany({
      select: {
        id: true,
        name: true,
        prefix: true,
        role: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async setApiAccess(actorId: string, enabled: boolean) {
    await this.prisma.systemSetting.upsert({
      where: { key: "apiAccess.enabled" },
      update: { value: { enabled } },
      create: { key: "apiAccess.enabled", value: { enabled } }
    });
    await this.audit.record({ event: enabled ? "api_enabled" : "api_disabled", actorId, entityType: "api_access", metadata: { enabled } });
    return this.apiAccess();
  }

  async createApiKey(actorId: string, dto: CreateApiKeyDto) {
    const key = this.generateApiKey();
    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        prefix: key.slice(0, 16),
        keyHash: this.hashApiKey(key),
        role: dto.role ?? Role.user,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: actorId
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        role: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } }
      }
    });
    await this.audit.record({ event: "api_key_created", actorId, entityType: "api_key", entityId: apiKey.id, metadata: { name: apiKey.name, role: apiKey.role } });
    return { ...apiKey, key };
  }

  async revokeApiKey(actorId: string, id: string) {
    const apiKey = await this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false, revokedAt: new Date() },
      select: { id: true, name: true, prefix: true, role: true, isActive: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true }
    });
    await this.audit.record({ event: "api_key_revoked", actorId, entityType: "api_key", entityId: id, metadata: { name: apiKey.name } });
    return apiKey;
  }

  async activateApiKey(actorId: string, id: string) {
    const apiKey = await this.prisma.apiKey.update({
      where: { id },
      data: { isActive: true, revokedAt: null },
      select: { id: true, name: true, prefix: true, role: true, isActive: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true }
    });
    await this.audit.record({ event: "api_key_activated", actorId, entityType: "api_key", entityId: id, metadata: { name: apiKey.name } });
    return apiKey;
  }

  mailSettings() {
    return this.mail.getSettings();
  }

  async updateMailSettings(actorId: string, dto: MailSettingsDto) {
    const settings = await this.mail.saveSettings(dto);
    await this.audit.record({ event: "mail_settings_updated", actorId, entityType: "system_setting", entityId: "mail.smtp" });
    return settings;
  }

  async sendTestEmail(actorId: string, dto: SendTestEmailDto) {
    const result = await this.mail.sendTestEmail(dto.recipientEmail);
    await this.audit.record({ event: "test_email_sent", actorId, entityType: "system_setting", entityId: "mail.smtp", metadata: { recipientEmail: dto.recipientEmail } });
    return result;
  }

  generateApiKey() {
    return `mfk_${randomBytes(32).toString("base64url")}`;
  }

  hashApiKey(key: string) {
    return createHash("sha256").update(key).digest("hex");
  }

  settingEnabled(value: unknown) {
    return Boolean(value && typeof value === "object" && "enabled" in value && (value as { enabled?: unknown }).enabled === true);
  }

  slugify(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";
  }

  async uniqueTeamSlug(base: string, ignoreId?: string) {
    let slug = base;
    let index = 2;
    while (await this.prisma.team.findFirst({ where: { slug, id: ignoreId ? { not: ignoreId } : undefined } })) {
      slug = `${base}-${index++}`;
    }
    return slug;
  }
}
