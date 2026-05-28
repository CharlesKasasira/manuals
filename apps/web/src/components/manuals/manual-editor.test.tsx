import { describe, expect, it } from "vitest";
import { slashCommandsForQuery } from "./manual-editor";

describe("slashCommandsForQuery", () => {
  it("returns the core authoring blocks with an empty query", () => {
    const labels = slashCommandsForQuery("").map((command) => command.label);

    expect(labels).toEqual(expect.arrayContaining(["Code", "Mermaid diagram", "Warning", "Image", "Table"]));
  });

  it("matches commands by label and keyword", () => {
    expect(slashCommandsForQuery("warn").map((command) => command.id)).toEqual(["warning"]);
    expect(slashCommandsForQuery("flowchart").map((command) => command.id)).toEqual(["diagram"]);
    expect(slashCommandsForQuery("playground").map((command) => command.id)).toEqual(["code", "tabs"]);
  });
});
