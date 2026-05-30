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

type SsoProviderType = "oidc" | "saml" | "ldap";

type OidcProviderConfig = {
  id: string;
  label: string;
  type: "oidc";
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
  role?: Role;
  autoProvision?: boolean;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
};

type SsoProviderSummary = {
  id: string;
  label: string;
  type: SsoProviderType;
  enabled: boolean;
};

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

    const token = await this.issueToken(user);
    await this.audit.record({ event: "login", actorId: user.id, ipAddress });

    return { token, user: this.serializeUser(user) };
  }

  async ssoProviders(): Promise<SsoProviderSummary[]> {
    return (await this.oidcProviders()).map((provider) => ({
      id: provider.id,
      label: provider.label,
      type: provider.type,
      enabled: true
    }));
  }

  async ssoStart(providerId: string, next = "/app") {
    const provider = await this.requireOidcProvider(providerId);
    const state = await this.jwt.signAsync(
      {
        purpose: "sso",
        provider: provider.id,
        next: this.safeNextPath(next),
        nonce: randomBytes(12).toString("base64url")
      },
      {
        secret: this.config.get<string>("JWT_SECRET", "manualflow-dev-secret"),
        expiresIn: "10m"
      }
    );
    const discovery = await this.oidcDiscovery(provider);
    const url = new URL(discovery.authorizationEndpoint);
    url.searchParams.set("client_id", provider.clientId);
    url.searchParams.set("redirect_uri", provider.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", (provider.scopes ?? ["openid", "email", "profile"]).join(" "));
    url.searchParams.set("state", state);
    return { url: url.toString() };
  }

  async ssoCallback(providerId: string, code: string, state: string, ipAddress?: string) {
    const provider = await this.requireOidcProvider(providerId);
    const statePayload = await this.jwt.verifyAsync(state, {
      secret: this.config.get<string>("JWT_SECRET", "manualflow-dev-secret")
    }).catch(() => null) as { purpose?: string; provider?: string; next?: string } | null;
    if (statePayload?.purpose !== "sso" || statePayload.provider !== provider.id) {
      throw new UnauthorizedException("Invalid SSO state.");
    }

    const discovery = await this.oidcDiscovery(provider);
    const tokenResponse = await fetch(discovery.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: provider.redirectUri,
        client_id: provider.clientId,
        client_secret: provider.clientSecret
      })
    });
    if (!tokenResponse.ok) throw new UnauthorizedException("SSO token exchange failed.");
    const tokenData = await tokenResponse.json() as { access_token?: string };
    if (!tokenData.access_token) throw new UnauthorizedException("SSO provider did not return an access token.");

    const userInfoResponse = await fetch(discovery.userinfoEndpoint, {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" }
    });
    if (!userInfoResponse.ok) throw new UnauthorizedException("Could not load SSO user profile.");
    const profile = await userInfoResponse.json() as { email?: string; email_verified?: boolean; name?: string; given_name?: string; family_name?: string; preferred_username?: string };
    const email = profile.email?.trim().toLowerCase();
    if (!email || profile.email_verified === false) throw new UnauthorizedException("SSO profile must include a verified email.");

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user && provider.autoProvision !== false) {
      user = await this.prisma.user.create({
        data: {
          email,
          name: profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(" ") || profile.preferred_username || email,
          passwordHash: await bcrypt.hash(randomBytes(32).toString("base64url"), 12),
          role: provider.role ?? Role.user
        }
      });
      await this.audit.record({ event: "user_created", actorId: user.id, entityType: "user", entityId: user.id, metadata: { email, role: user.role, source: `sso:${provider.id}` } });
    }
    if (!user || !user.isActive) throw new UnauthorizedException("SSO account is not allowed.");

    const token = await this.issueToken(user);
    await this.audit.record({ event: "login", actorId: user.id, ipAddress, metadata: { source: `sso:${provider.id}` } });
    return { token, user: this.serializeUser(user), next: this.safeNextPath(statePayload.next ?? "/app") };
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

  loginRedirectUrl() {
    return this.mail.appUrl("/login");
  }

  private async issueToken(user: { id: string; role: Role }) {
    return this.jwt.signAsync(
      { sub: user.id, role: user.role },
      {
        secret: this.config.get<string>("JWT_SECRET", "manualflow-dev-secret"),
        expiresIn: "8h"
      }
    );
  }

  private async oidcProviders(): Promise<OidcProviderConfig[]> {
    const providers: OidcProviderConfig[] = [];
    const setting = await this.prisma.systemSetting?.findUnique?.({ where: { key: "auth.strategies" } });
    const strategies = setting?.value && typeof setting.value === "object" ? setting.value as Record<string, Record<string, unknown>> : {};
    const keycloak = strategies.keycloak;
    if (keycloak?.enabled && keycloak.issuer && keycloak.clientId && keycloak.clientSecret && keycloak.redirectUri) {
      const provider = this.normalizeOidcProvider({
        id: "keycloak",
        label: String(keycloak.displayName || "Keycloak"),
        type: "oidc",
        issuer: String(keycloak.issuer),
        clientId: String(keycloak.clientId),
        clientSecret: String(keycloak.clientSecret),
        redirectUri: String(keycloak.redirectUri),
        scopes: typeof keycloak.scopes === "string" ? keycloak.scopes.split(/\s+/).filter(Boolean) : undefined,
        role: Object.values(Role).includes(keycloak.assignRole as Role) ? keycloak.assignRole as Role : Role.user,
        autoProvision: keycloak.autoProvision !== false
      });
      if (provider) providers.push(provider);
    }

    const raw = this.config.get<string>("SSO_OIDC_PROVIDERS");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Array<Partial<OidcProviderConfig>> | Record<string, Partial<OidcProviderConfig>>;
        const values = Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([id, value]) => ({ id, ...value }));
        providers.push(...values.map((provider) => this.normalizeOidcProvider(provider)).filter((provider): provider is OidcProviderConfig => Boolean(provider)));
        return providers;
      } catch {
        return providers;
      }
    }

    const issuer = this.config.get<string>("SSO_OIDC_ISSUER");
    const clientId = this.config.get<string>("SSO_OIDC_CLIENT_ID");
    const clientSecret = this.config.get<string>("SSO_OIDC_CLIENT_SECRET");
    const redirectUri = this.config.get<string>("SSO_OIDC_REDIRECT_URI");
    if (!issuer || !clientId || !clientSecret || !redirectUri) return providers;
    const provider = this.normalizeOidcProvider({
      id: this.config.get<string>("SSO_OIDC_ID", "oidc"),
      label: this.config.get<string>("SSO_OIDC_LABEL", "Single Sign-On"),
      type: "oidc",
      issuer,
      clientId,
      clientSecret,
      redirectUri,
      role: this.config.get<Role>("SSO_OIDC_DEFAULT_ROLE", Role.user)
    });
    if (provider) providers.push(provider);
    return providers;
  }

  private normalizeOidcProvider(provider: Partial<OidcProviderConfig>): OidcProviderConfig | null {
    if (!provider.id || !provider.issuer || !provider.clientId || !provider.clientSecret || !provider.redirectUri) return null;
    return {
      id: provider.id,
      label: provider.label || provider.id,
      type: "oidc" as const,
      issuer: provider.issuer.replace(/\/$/, ""),
      clientId: provider.clientId,
      clientSecret: provider.clientSecret,
      redirectUri: provider.redirectUri,
      scopes: provider.scopes,
      role: provider.role ?? Role.user,
      autoProvision: provider.autoProvision,
      authorizationEndpoint: provider.authorizationEndpoint,
      tokenEndpoint: provider.tokenEndpoint,
      userinfoEndpoint: provider.userinfoEndpoint
    };
  }

  private async requireOidcProvider(providerId: string) {
    const provider = (await this.oidcProviders()).find((item) => item.id === providerId);
    if (!provider) throw new BadRequestException("SSO provider is not configured.");
    return provider;
  }

  private async oidcDiscovery(provider: OidcProviderConfig) {
    if (provider.authorizationEndpoint && provider.tokenEndpoint && provider.userinfoEndpoint) {
      return {
        authorizationEndpoint: provider.authorizationEndpoint,
        tokenEndpoint: provider.tokenEndpoint,
        userinfoEndpoint: provider.userinfoEndpoint
      };
    }
    const response = await fetch(`${provider.issuer}/.well-known/openid-configuration`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new BadRequestException("Could not discover SSO provider metadata.");
    const metadata = await response.json() as { authorization_endpoint?: string; token_endpoint?: string; userinfo_endpoint?: string };
    if (!metadata.authorization_endpoint || !metadata.token_endpoint || !metadata.userinfo_endpoint) {
      throw new BadRequestException("SSO provider metadata is incomplete.");
    }
    return {
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      userinfoEndpoint: metadata.userinfo_endpoint
    };
  }

  private safeNextPath(value: string) {
    return value.startsWith("/") && !value.startsWith("//") ? value : "/app";
  }
}
