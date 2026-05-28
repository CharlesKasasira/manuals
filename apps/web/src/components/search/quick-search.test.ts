import { describe, expect, it } from "vitest";
import { quickAnswerFromResults, quickSearchHref } from "./quick-search";

describe("quickSearchHref", () => {
  it("builds public and app reader links with matched page anchors", () => {
    const manual = { slug: "network-manual", matchedPages: [{ slug: "restart-router" }] };

    expect(quickSearchHref(manual, false)).toBe("/manuals/network-manual#page-restart-router");
    expect(quickSearchHref(manual, true)).toBe("/app/manuals/network-manual#page-restart-router");
  });
});

describe("quickAnswerFromResults", () => {
  it("derives a short answer from the top manual result", () => {
    const answer = quickAnswerFromResults([
      {
        id: "manual-1",
        type: "manual",
        title: "Network Manual",
        subtitle: "Operations",
        href: "/manuals/network-manual",
        snippet: "Restart the router, wait for link lights, then verify connectivity.",
        score: 80
      }
    ], "restart router");

    expect(answer).toContain("Restart the router");
    expect(answer).toContain("Source: Network Manual.");
  });

  it("stays quiet until the user enters a meaningful query", () => {
    expect(quickAnswerFromResults([], "r")).toBe("");
  });
});
