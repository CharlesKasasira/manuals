import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ManualBrowser } from "./manual-browser";
import type { Manual } from "@/lib/types";

const manuals: Manual[] = [
  {
    id: "manual-1",
    title: "Network Operations Manual",
    slug: "network-operations-manual",
    description: "Core NOC runbook.",
    status: "published",
    visibility: "public",
    version: 2,
    reviewState: "approved",
    viewCount: 12,
    updatedAt: "2026-05-15T00:00:00.000Z",
    space: { id: "space-1", name: "Operations", slug: "operations" },
    tags: [{ id: "tag-1", name: "Operations", slug: "operations" }],
    pages: []
  },
  {
    id: "manual-2",
    title: "Private Draft",
    slug: "private-draft",
    description: "Work in progress.",
    status: "draft",
    visibility: "private",
    version: 1,
    reviewState: "none",
    viewCount: 0,
    updatedAt: "2026-05-14T00:00:00.000Z",
    space: { id: "space-2", name: "Engineering", slug: "engineering" },
    tags: [],
    pages: []
  }
];

describe("ManualBrowser", () => {
  it("server-renders manual cards, counts, filters, tags, and console links", () => {
    const html = renderToString(<ManualBrowser manuals={manuals} hrefPrefix="/app/manuals" />).replaceAll("<!-- -->", "");

    expect(html).toContain("Manual Library");
    expect(html).toContain("2 manuals");
    expect(html).toContain("2 shown");
    expect(html).toContain("Network Operations Manual");
    expect(html).toContain("Private Draft");
    expect(html).toContain("#Operations");
    expect(html).toContain("/app/manuals/network-operations-manual");
  });

  it("server-renders a useful empty state", () => {
    const html = renderToString(<ManualBrowser manuals={[]} />).replaceAll("<!-- -->", "");

    expect(html).toContain("0 manuals");
    expect(html).toContain("No matching manuals found.");
  });
});
