import { describe, expect, it } from "vitest";
import { markdownToHtml, sanitizeRichHtml, videoEmbedUrl } from "./manual-content";

describe("manual content video embeds", () => {
  it("converts YouTube watch URLs into embeddable URLs", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=rHNnIn0-7bE")).toBe("https://www.youtube.com/embed/rHNnIn0-7bE");
  });

  it("keeps sanitized YouTube iframe embeds", () => {
    const html = sanitizeRichHtml('<iframe src="https://www.youtube.com/embed/rHNnIn0-7bE" onload="alert(1)"></iframe>');

    expect(html).toBe('<iframe src="https://www.youtube.com/embed/rHNnIn0-7bE" loading="lazy" allowfullscreen></iframe>');
  });
});

describe("manual content rich markdown blocks", () => {
  it("renders mermaid fences as diagram containers", () => {
    const html = markdownToHtml("```mermaid\nflowchart TD\n  A --> B\n```");

    expect(html).toContain('class="manual-mermaid"');
    expect(html).toContain("flowchart TD");
    expect(html).toContain("data-chart=");
  });

  it("renders directive callouts and details panels", () => {
    const html = markdownToHtml([
      ":::warning Production change",
      "Confirm the maintenance window.",
      ":::",
      ":::tip Shortcut",
      "Use the saved filter.",
      ":::",
      ":::details Advanced steps",
      "Only run these during escalation.",
      ":::"
    ].join("\n"));

    expect(html).toContain("manual-callout-warning");
    expect(html).toContain("Production change");
    expect(html).toContain("manual-callout-tip");
    expect(html).toContain("Shortcut");
    expect(html).toContain("manual-details");
    expect(html).toContain("<summary>Advanced steps</summary>");
  });
});
