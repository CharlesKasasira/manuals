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
  });

  it("keeps public reader contents links on the public reader route", () => {
    const html = renderToString(<ReaderLayout manual={manual} />).replaceAll("<!-- -->", "");

    expect(html).toContain("/manuals/manual-one#page-testing-here");
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
});
