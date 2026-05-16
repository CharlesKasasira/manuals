import { Reflector } from "@nestjs/core";
import { Role } from "@prisma/client";
import { RolesGuard } from "./roles.guard";

function contextWithUser(user: unknown) {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user }) })
  } as any;
}

describe("RolesGuard", () => {
  it("allows routes without role metadata", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(contextWithUser(null))).toBe(true);
  });

  it("allows users with an accepted role", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([Role.admin, Role.manager]) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(contextWithUser({ id: "user-1", role: Role.manager }))).toBe(true);
  });

  it("denies missing users and users with the wrong role", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([Role.admin]) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(contextWithUser(null))).toBe(false);
    expect(guard.canActivate(contextWithUser({ id: "user-1", role: Role.user }))).toBe(false);
  });
});
