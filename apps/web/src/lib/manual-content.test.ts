import { describe, expect, it } from "vitest";
import { sanitizeRichHtml, videoEmbedUrl } from "./manual-content";

describe("manual content video embeds", () => {
  it("converts YouTube watch URLs into embeddable URLs", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=rHNnIn0-7bE")).toBe("https://www.youtube.com/embed/rHNnIn0-7bE");
  });

  it("keeps sanitized YouTube iframe embeds", () => {
    const html = sanitizeRichHtml('<iframe src="https://www.youtube.com/embed/rHNnIn0-7bE" onload="alert(1)"></iframe>');

    expect(html).toBe('<iframe src="https://www.youtube.com/embed/rHNnIn0-7bE" loading="lazy" allowfullscreen></iframe>');
  });
});
