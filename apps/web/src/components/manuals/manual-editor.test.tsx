import { describe, expect, it } from "vitest";
import { governanceStepsForStatus, reorderPagesForDrop, slashCommandsForQuery } from "./manual-editor";
import type { ManualPage } from "@/lib/types";

describe("slashCommandsForQuery", () => {
  it("returns the core authoring blocks with an empty query", () => {
    const labels = slashCommandsForQuery("").map((command) => command.label);

    expect(labels).toEqual(expect.arrayContaining(["Code Block", "Mermaid diagram", "Callout Block", "Add Image", "Insert Table"]));
  });

  it("matches commands by label and keyword", () => {
    expect(slashCommandsForQuery("warn").map((command) => command.id)).toEqual(["warning"]);
    expect(slashCommandsForQuery("flowchart").map((command) => command.id)).toEqual(["diagram"]);
    expect(slashCommandsForQuery("playground").map((command) => command.id)).toEqual(["code", "tabs"]);
  });
});

const page = (id: string, title: string, sortOrder: number, parentId: string | null = null, children: ManualPage[] = []): ManualPage => ({
  id,
  manualId: "manual-1",
  title,
  slug: id,
  sortOrder,
  parentId,
  status: "draft",
  children
});

describe("reorderPagesForDrop", () => {
  it("moves a page before a sibling and recalculates sibling order", () => {
    const updates = reorderPagesForDrop([
      page("a", "A", 1),
      page("b", "B", 2),
      page("c", "C", 3)
    ], "c", "a", "before");

    expect(updates).toEqual([
      { id: "c", parentId: null, sortOrder: 1 },
      { id: "a", parentId: null, sortOrder: 2 },
      { id: "b", parentId: null, sortOrder: 3 }
    ]);
  });

  it("nests a page under the drop target", () => {
    const updates = reorderPagesForDrop([
      page("a", "A", 1),
      page("b", "B", 2)
    ], "b", "a", "inside");

    expect(updates).toContainEqual({ id: "b", parentId: "a", sortOrder: 1 });
  });

  it("does not allow nesting a page inside its own descendant", () => {
    const updates = reorderPagesForDrop([
      page("a", "A", 1, null, [
        page("b", "B", 1, "a")
      ])
    ], "a", "b", "inside");

    expect(updates).toBeNull();
  });
});

describe("governanceStepsForStatus", () => {
  it("marks the current governance stage", () => {
    expect(governanceStepsForStatus("in_review").map((step) => step.state)).toEqual([
      "complete",
      "active",
      "upcoming",
      "upcoming",
      "upcoming"
    ]);
  });

  it("surfaces changes requested as its own workflow step", () => {
    const steps = governanceStepsForStatus("in_review", "changes_requested");

    expect(steps.find((step) => step.id === "changes_requested")?.state).toBe("active");
  });
});
