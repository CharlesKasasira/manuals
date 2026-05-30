import type { ManualPage } from "@/lib/types";

export type ManualHeading = {
  level: number;
  title: string;
  id: string;
};

const unsafeElementPattern = /<\s*(script|style|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const unsafeVoidElementPattern = /<\s*(script|style|object|embed|link|meta)[^>]*\/?>/gi;

export function pageMarkdown(page?: ManualPage | null) {
  return page?.publishedMarkdown || page?.draftMarkdown || "";
}

export function pageRichHtml(page?: ManualPage | null) {
  const richHtml = page?.publishedContentHtml || page?.draftContentHtml;
  if (richHtml?.trim()) return sanitizeRichHtml(richHtml);
  return "";
}

export function sanitizeRichHtml(html = "") {
  return html
    .replace(unsafeElementPattern, "")
    .replace(unsafeVoidElementPattern, "")
    .replace(/<iframe\b([^>]*)(?:>[\s\S]*?<\/iframe>|\/?>)/gi, (_match, attrs) => sanitizeIframe(attrs))
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
    .trim();
}

export function richHtmlWithHeadingIds(html: string, pageSlug: string) {
  return sanitizeRichHtml(html).replace(/<h([1-4])([^>]*)>([\s\S]*?)<\/h\1>/gi, (match, level, attrs, content) => {
    if (/\sid\s*=/.test(attrs)) return match;
    const title = htmlToText(content);
    return `<h${level}${attrs} id="${pageSlug}-${slugify(title)}">${content}</h${level}>`;
  });
}

export function headingsFromRichHtml(html = ""): ManualHeading[] {
  const headings: ManualHeading[] = [];
  const safeHtml = sanitizeRichHtml(html);
  const pattern = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match = pattern.exec(safeHtml);

  while (match) {
    const title = htmlToText(match[2]);
    if (title) headings.push({ level: Number(match[1]), title, id: slugify(title) });
    match = pattern.exec(safeHtml);
  }

  return headings;
}

export function headingsFromMarkdown(markdown = ""): ManualHeading[] {
  return markdown.split(/\r?\n/).reduce<ManualHeading[]>((headings, line) => {
    const match = /^(#{1,4})\s+(.+)$/.exec(line);
    if (!match) return headings;

    const title = match[2];
    headings.push({
      level: match[1].length,
      title,
      id: slugify(title)
    });
    return headings;
  }, []);
}

export function htmlToText(html = "") {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function videoEmbedUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const embedId = url.pathname.match(/^\/embed\/([^/?#]+)/)?.[1];
      if (embedId) return `https://www.youtube.com/embed/${encodeURIComponent(embedId)}`;
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : "";
    }
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : "";
    }
    if (host === "vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : "";
    }
    if (host === "player.vimeo.com" && url.pathname.startsWith("/video/")) return url.toString();
    if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) return url.toString();
  } catch {
    return "";
  }

  return "";
}

export function highlightCode(language: string, code: string) {
  const escaped = escapeHtml(code);
  const normalized = language.trim().toLowerCase();

  if (["js", "javascript", "ts", "typescript", "tsx", "jsx"].includes(normalized)) {
    return escaped
      .replace(/\b(const|let|var|function|return|if|else|for|while|await|async|import|from|export|type|interface|class|extends|new|try|catch|throw)\b/g, '<span class="syntax-keyword">$1</span>')
      .replace(/(&quot;.*?&quot;|'.*?'|`.*?`)/g, '<span class="syntax-string">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="syntax-number">$1</span>')
      .replace(/(\/\/.*)$/gm, '<span class="syntax-comment">$1</span>');
  }

  if (["html", "xml"].includes(normalized)) {
    return escaped
      .replace(/(&lt;\/?)([a-zA-Z0-9-]+)/g, '$1<span class="syntax-keyword">$2</span>')
      .replace(/([a-zA-Z-]+)=(&quot;.*?&quot;)/g, '<span class="syntax-attr">$1</span>=<span class="syntax-string">$2</span>');
  }

  if (["css", "scss"].includes(normalized)) {
    return escaped
      .replace(/([.#]?[a-zA-Z0-9_-]+)(\s*\{)/g, '<span class="syntax-keyword">$1</span>$2')
      .replace(/([a-zA-Z-]+)(\s*:)/g, '<span class="syntax-attr">$1</span>$2')
      .replace(/(#(?:[0-9a-fA-F]{3}){1,2}|\b\d+(?:px|rem|em|%)\b)/g, '<span class="syntax-number">$1</span>');
  }

  if (["json"].includes(normalized)) {
    return escaped
      .replace(/(&quot;[^&]+&quot;)(\s*:)/g, '<span class="syntax-attr">$1</span>$2')
      .replace(/(:\s*)(&quot;.*?&quot;)/g, '$1<span class="syntax-string">$2</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="syntax-keyword">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="syntax-number">$1</span>');
  }

  return escaped;
}

export function slugify(value: unknown) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
}

export function markdownToHtml(markdown = "") {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | null = null;
  let inCode = false;
  let codeLines: string[] = [];
  let codeLanguage = "";
  let directive: { kind: "info" | "warning" | "tip" | "details"; title: string; lines: string[] } | null = null;

  function closeList() {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  }

  function flushDirective() {
    if (!directive) return;
    const innerHtml = markdownToHtml(directive.lines.join("\n"));
    if (directive.kind === "details") {
      html.push(`<details class="manual-details"><summary>${escapeHtml(directive.title || "Details")}</summary>${innerHtml}</details>`);
    } else {
      const title = directive.title || directive.kind[0].toUpperCase() + directive.kind.slice(1);
      html.push(`<div class="manual-callout manual-callout-${directive.kind}"><strong>${escapeHtml(title)}</strong>${innerHtml}</div>`);
    }
    directive = null;
  }

  for (const line of lines) {
    if (directive) {
      if (/^:::\s*$/.test(line)) {
        flushDirective();
      } else {
        directive.lines.push(line);
      }
      continue;
    }

    const directiveStart = /^:::(info|warning|tip|details)(?:\s+(.+))?\s*$/i.exec(line);
    if (directiveStart) {
      closeList();
      directive = {
        kind: directiveStart[1].toLowerCase() as "info" | "warning" | "tip" | "details",
        title: directiveStart[2]?.trim() ?? "",
        lines: []
      };
      continue;
    }

    const codeFence = /^```\s*([a-zA-Z0-9_-]+)?\s*$/.exec(line);
    if (codeFence) {
      closeList();
      if (inCode) {
        html.push(codeBlockHtml(codeLanguage, codeLines.join("\n")));
        codeLines = [];
        codeLanguage = "";
      } else {
        codeLanguage = codeFence[1] ?? "";
      }
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      html.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }

    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (ordered) {
      if (list !== "ol") {
        closeList();
        list = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      if (list !== "ul") {
        closeList();
        list = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const quote = /^>\s+(.+)$/.exec(line);
    if (quote) {
      closeList();
      html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeList();
  if (directive) flushDirective();
  if (inCode) html.push(codeBlockHtml(codeLanguage, codeLines.join("\n")));
  return sanitizeRichHtml(html.join(""));
}

function codeBlockHtml(language: string, code: string) {
  const normalized = language.trim().toLowerCase();
  if (normalized === "mermaid") {
    const escaped = escapeHtml(code);
    return `<div class="manual-mermaid" data-chart="${escapeAttribute(code)}">${escaped}</div>`;
  }
  const languageAttrs = normalized ? ` data-language="${escapeAttribute(normalized)}"` : "";
  const classAttr = normalized ? ` class="language-${escapeAttribute(normalized)}"` : "";
  return `<pre${languageAttrs}><code${classAttr}>${highlightCode(normalized, code)}</code></pre>`;
}

function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char] ?? char));
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/\n/g, "&#10;");
}

function sanitizeIframe(attrs: string) {
  const src = /(?:^|\s)src\s*=\s*(["'])(.*?)\1/i.exec(attrs)?.[2] ?? "";
  const safeSrc = videoEmbedUrl(src);
  if (!safeSrc || /\.(mp4|webm|ogg)$/i.test(safeSrc)) return "";
  return `<iframe src="${safeSrc}" title="Embedded video" loading="eager" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
}
