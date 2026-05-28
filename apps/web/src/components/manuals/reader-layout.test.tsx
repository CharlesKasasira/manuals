import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReaderLayout } from "./reader-layout";
import type { Manual } from "@/lib/types";

const manual: Manual = {
  id: "manual-1",
  title: "Manual one",
  slug: "manual-one",
  description: "Manual one Description.",
  status: "published",
  visibility: "internal",
  version: 6,
  reviewState: "approved",
  viewCount: 27,
  updatedAt: "2026-05-16T00:00:00.000Z",
  owner: { id: "user-1", name: "Manuals Admin", email: "admin@example.com", role: "admin" },
  space: { id: "space-1", name: "Operations", slug: "operations" },
  knowledgeSignals: {
    pageCount: 1,
    publishedPageCount: 1,
    draftPageCount: 0,
    emptyPageCount: 0,
    wordCount: 3,
    readingTimeMinutes: 1,
    reviewDueStatus: "not_scheduled",
    daysUntilReview: null,
    daysSinceReview: null,
    qualityScore: 90
  },
  tableOfContents: [
    {
      id: "page-1",
      manualId: "manual-1",
      title: "Testing here",
      slug: "testing-here",
      sortOrder: 1,
      status: "published",
      publishedMarkdown: "# Testing here"
    }
  ]
};

describe("ReaderLayout", () => {
  it("keeps authenticated reader contents links on the app reader route", () => {
    const html = renderToString(<ReaderLayout manual={manual} app />).replaceAll("<!-- -->", "");

    expect(html).toContain("/app/manuals/manual-one/reader#page-testing-here");
    expect(html).toContain("Owner");
    expect(html).toContain("Manuals Admin");
    expect(html).toContain("Operations");
    expect(html).toContain("Pages");
    expect(html).toContain("Review");
    expect(html).toContain("Print");
    expect(html).toContain("PDF");
    expect(html).toContain("Private link");
    expect(html).toContain("Send email");
  });

  it("keeps public reader contents links on the public reader route without authenticated details", () => {
    const html = renderToString(<ReaderLayout manual={manual} />).replaceAll("<!-- -->", "");

    expect(html).toContain("/manuals/manual-one#page-testing-here");
    expect(html).not.toContain("Owner");
    expect(html).not.toContain("Manuals Admin");
    expect(html).not.toContain("Operations");
    expect(html).not.toContain("Pages");
    expect(html).not.toContain("Review");
    expect(html).not.toContain("Print");
    expect(html).not.toContain("PDF");
    expect(html).not.toContain("Private link");
    expect(html).not.toContain("Send email");
    expect(html).toContain("Reading time");
    expect(html).toContain("Last updated");
  });

  it("renders rich HTML pages before legacy markdown", () => {
    const html = renderToString(
      <ReaderLayout
        manual={{
          ...manual,
          tableOfContents: [
            {
              ...manual.tableOfContents![0],
              publishedMarkdown: "# Legacy",
              publishedContentHtml: "<h2>Rich heading</h2><p>Rich body</p>"
            }
          ]
        }}
      />
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("Rich heading");
    expect(html).toContain("Rich body");
    expect(html).not.toContain("Legacy");
  });

  it("renders mermaid markdown through the reader HTML path", () => {
    const html = renderToString(
      <ReaderLayout
        manual={{
          ...manual,
          tableOfContents: [
            {
              ...manual.tableOfContents![0],
              publishedMarkdown: "```mermaid\nflowchart TD\n  A --> B\n```"
            }
          ]
        }}
      />
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("manual-mermaid");
    expect(html).toContain("flowchart TD");
  });
});
