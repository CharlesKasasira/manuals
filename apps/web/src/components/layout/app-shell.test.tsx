import { describe, expect, it } from "vitest";
import { visibleNavItemsForRole } from "./app-shell";

describe("visibleNavItemsForRole", () => {
  it("hides admin-only routes from non-admin users", () => {
    const labels = visibleNavItemsForRole("user").map((item) => item.label);

    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Manuals");
    expect(labels).not.toContain("Admin");
  });

  it("shows admin-only routes to admins", () => {
    const labels = visibleNavItemsForRole("admin").map((item) => item.label);

    expect(labels).toContain("Admin");
  });

  it("hides restricted routes until the current user is known", () => {
    const labels = visibleNavItemsForRole(null).map((item) => item.label);

    expect(labels).not.toContain("Admin");
  });
});
