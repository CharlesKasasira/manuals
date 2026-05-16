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

  function makeService(overrides: { user?: unknown } = {}) {
    const resolvedUser = Object.prototype.hasOwnProperty.call(overrides, "user") ? overrides.user : user;
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(resolvedUser),
        create: jest.fn()
      }
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue("signed-token") };
    const config = { get: jest.fn().mockReturnValue("test-secret") };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const mail = { appUrl: jest.fn(), sendMail: jest.fn() };
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
});
