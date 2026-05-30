import { UnauthorizedException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthService } from "./auth.service";

jest.mock("bcryptjs", () => ({
  __esModule: true,
  compare: jest.fn(),
  hash: jest.fn(),
  default: {
    compare: jest.fn(),
    hash: jest.fn()
  }
}));

const bcrypt = jest.requireMock("bcryptjs") as {
  compare: jest.Mock<Promise<boolean>, [string, string]>;
  hash: jest.Mock<Promise<string>, [string, number]>;
};

describe("AuthService", () => {
  const user = {
    id: "user-1",
    email: "admin@manualflow.local",
    name: "Admin",
    role: Role.admin,
    isActive: true,
    passwordHash: ""
  };

  function makeService(overrides: { user?: unknown; config?: Record<string, string> } = {}) {
    const resolvedUser = Object.prototype.hasOwnProperty.call(overrides, "user") ? overrides.user : user;
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(resolvedUser),
        create: jest.fn()
      }
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue("signed-token"), verifyAsync: jest.fn().mockResolvedValue({ purpose: "sso", provider: "okta", next: "/app" }) };
    const configValues: Record<string, string> = { JWT_SECRET: "test-secret", ...overrides.config };
    const config = { get: jest.fn((key: string, fallback?: string) => configValues[key] ?? fallback) };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const mail = { appUrl: jest.fn((path: string) => `http://localhost:3000${path}`), sendMail: jest.fn() };
    return { service: new AuthService(prisma as any, jwt as any, config as any, audit as any, mail as any), prisma, jwt, audit };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    user.passwordHash = "hashed-password";
    bcrypt.compare.mockImplementation(async (password, hash) => password === "Manuals123!" && hash === "hashed-password");
    bcrypt.hash.mockResolvedValue("new-hashed-password");
  });

  it("issues a token and records audit on valid credentials", async () => {
    const { service, jwt, audit } = makeService();

    const result = await service.login({ email: user.email, password: "Manuals123!" }, "127.0.0.1");

    expect(result).toEqual({
      token: "signed-token",
      user: { id: user.id, email: user.email, name: user.name, role: user.role, isActive: true }
    });
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: user.id, role: Role.admin }, { secret: "test-secret", expiresIn: "8h" });
    expect(audit.record).toHaveBeenCalledWith({ event: "login", actorId: user.id, ipAddress: "127.0.0.1" });
  });

  it("rejects inactive or missing users without issuing a token", async () => {
    const { service, jwt } = makeService({ user: null });

    await expect(service.login({ email: user.email, password: "Manuals123!" })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it("rejects invalid passwords", async () => {
    const { service, jwt } = makeService();

    await expect(service.login({ email: user.email, password: "wrong-password" })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it("registers users with hashed passwords and audit metadata", async () => {
    const { service, prisma, audit } = makeService();
    prisma.user.create.mockResolvedValue({ ...user, email: "new@manualflow.local", role: Role.manager });

    const result = await service.register("admin-1", {
      email: "new@manualflow.local",
      name: "New Manager",
      password: "LongPassword123",
      role: Role.manager
    });

    expect(result.email).toBe("new@manualflow.local");
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "new@manualflow.local",
        name: "New Manager",
        role: Role.manager,
        passwordHash: expect.any(String)
      })
    });
    expect(bcrypt.hash).toHaveBeenCalledWith("LongPassword123", 12);
    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).toBe("new-hashed-password");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      event: "user_created",
      actorId: "admin-1",
      metadata: { email: "new@manualflow.local", role: Role.manager }
    }));
  });

  it("lists configured OIDC SSO providers without exposing secrets", async () => {
    const { service } = makeService({
      config: {
        SSO_OIDC_PROVIDERS: JSON.stringify({
          okta: {
            label: "Okta",
            issuer: "https://example.okta.com/oauth2/default",
            clientId: "client-id",
            clientSecret: "client-secret",
            redirectUri: "http://localhost:4000/auth/sso/okta/callback"
          }
        })
      }
    });

    await expect(service.ssoProviders()).resolves.toEqual([{ id: "okta", label: "Okta", type: "oidc", enabled: true }]);
  });

  it("provisions verified OIDC users and issues a local session token", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const value = String(url);
      if (value.includes("openid-configuration")) {
        return new Response(JSON.stringify({
          authorization_endpoint: "https://idp.example/authorize",
          token_endpoint: "https://idp.example/token",
          userinfo_endpoint: "https://idp.example/userinfo"
        }), { status: 200 });
      }
      if (value.includes("/token")) {
        return new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 });
      }
      return new Response(JSON.stringify({ email: "new.user@example.com", email_verified: true, name: "New User" }), { status: 200 });
    });
    const { service, prisma, audit } = makeService({
      user: null,
      config: {
        SSO_OIDC_PROVIDERS: JSON.stringify({
          okta: {
            label: "Okta",
            issuer: "https://idp.example",
            clientId: "client-id",
            clientSecret: "client-secret",
            redirectUri: "http://localhost:4000/auth/sso/okta/callback",
            role: "manager"
          }
        })
      }
    });
    prisma.user.create.mockResolvedValue({ ...user, id: "new-user", email: "new.user@example.com", name: "New User", role: Role.manager });

    const result = await service.ssoCallback("okta", "auth-code", "state-token", "127.0.0.1");

    expect(result.token).toBe("signed-token");
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "new.user@example.com",
        name: "New User",
        role: Role.manager,
        passwordHash: expect.any(String)
      })
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: "login", metadata: { source: "sso:okta" } }));
    fetchMock.mockRestore();
  });
});
