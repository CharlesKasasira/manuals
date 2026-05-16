import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { MailService } from "../mail/mail.service";
import { LoginDto, RegisterDto, RequestPasswordResetDto, ResetPasswordDto } from "./auth.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mail: MailService
  ) {}

  async login(dto: LoginDto, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException("Invalid credentials.");

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Invalid credentials.");

    const token = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      {
        secret: this.config.get<string>("JWT_SECRET", "manualflow-dev-secret"),
        expiresIn: "8h"
      }
    );
    await this.audit.record({ event: "login", actorId: user.id, ipAddress });

    return { token, user: this.serializeUser(user) };
  }

  async logout(userId?: string | null, ipAddress?: string) {
    await this.audit.record({ event: "logout", actorId: userId ?? null, ipAddress });
    return { ok: true };
  }

  async register(actorId: string, dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: dto.role ?? Role.user
      }
    });
    await this.audit.record({
      event: "user_created",
      actorId,
      entityType: "user",
      entityId: user.id,
      metadata: { email: user.email, role: user.role }
    });
    return this.serializeUser(user);
  }

  async requestPasswordReset(dto: RequestPasswordResetDto, ipAddress?: string) {
    const mailSettings = await this.mail.requireConfiguredSettings();
    const user = await this.prisma.user.findFirst({ where: { email: dto.email, isActive: true, deletedAt: null } });
    if (!user) return { ok: true };

    const token = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt }
    });

    const resetUrl = this.mail.appUrl(`/login?resetToken=${encodeURIComponent(token)}`);
    await this.mail.sendMail({
      to: user.email,
      subject: "Reset your Manuals password",
      text: `Use this link to reset your Manuals password: ${resetUrl}\n\nThis link expires in 1 hour.`,
      html: `<p>Use this link to reset your Manuals password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`
    }, mailSettings);
    await this.audit.record({ event: "password_reset_requested", actorId: user.id, ipAddress });
    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto, ipAddress?: string) {
    const now = new Date();
    const token = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash: this.hashToken(dto.token), usedAt: null, expiresAt: { gt: now } },
      include: { user: true }
    });
    if (!token || !token.user.isActive || token.user.deletedAt) throw new BadRequestException("Password reset link is invalid or expired.");

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: token.userId }, data: { passwordHash: await bcrypt.hash(dto.password, 12) } }),
      this.prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: now } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: token.userId, usedAt: null, expiresAt: { lt: now } } })
    ]);
    await this.audit.record({ event: "password_reset_completed", actorId: token.userId, ipAddress });
    return { ok: true };
  }

  serializeUser(user: { id: string; email: string; name: string; role: Role; isActive: boolean }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive
    };
  }

  hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}
