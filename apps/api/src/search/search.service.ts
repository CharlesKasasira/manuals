import { Injectable } from "@nestjs/common";
import { ManualStatus, Prisma, Visibility } from "@prisma/client";
import { ManualsService } from "../manuals/manuals.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService, private readonly manuals: ManualsService) {}

  async search(actor: any, query: { q?: string; space?: string; visibility?: Visibility; tag?: string; type?: string }) {
    const q = (query.q ?? "").trim();
    const manualWhere: Prisma.ManualWhereInput = {
      deletedAt: null,
      AND: [this.manuals.visibilityWhere(actor)],
      ...(!actor || actor.role === "user" ? { status: ManualStatus.published } : {})
    };
    if (query.space) manualWhere.space = { slug: query.space };
    if (query.visibility) manualWhere.visibility = query.visibility;
    if (query.tag) manualWhere.tags = { some: { tag: { slug: query.tag } } };
    if (q) {
      const and = Array.isArray(manualWhere.AND) ? manualWhere.AND : [];
      and.push({ OR: [
        { title: { contains: q } },
        { description: { contains: q } },
        { pages: { some: { OR: [{ title: { contains: q } }, { contentPlain: { contains: q } }] } } },
        { tags: { some: { tag: { name: { contains: q } } } } }
      ] });
      manualWhere.AND = and;
    }

    const includeManuals = !query.type || query.type === "manual";
    const includeAssets = !query.type || query.type === "asset";

    const [manuals, assets] = await Promise.all([
      includeManuals
        ? this.prisma.manual.findMany({
            where: manualWhere,
            include: { space: true, tags: { include: { tag: true } }, pages: { orderBy: { sortOrder: "asc" } } },
            take: 50,
            orderBy: { updatedAt: "desc" }
          })
        : [],
      includeAssets
        ? this.prisma.asset.findMany({
            where: {
              ...(q ? { fileName: { contains: q } } : {}),
              visibility: actor ? { in: [Visibility.public, Visibility.internal] } : Visibility.public
            },
            take: 20,
            orderBy: { createdAt: "desc" }
          })
        : []
    ]);

    const rankedManuals = manuals
      .map((manual) => {
        const tags = manual.tags.map((item) => item.tag);
        const matchedPages = this.matchedPages(manual.pages, q);
        const rank = this.rankManual({
          title: manual.title,
          description: manual.description,
          tags: tags.map((tag) => tag.name),
          matchedPages
        }, q);
        return {
          ...manual,
          type: "manual",
          tags,
          matchedPages,
          rank
        };
      })
      .sort((a, b) => b.rank.score - a.rank.score || Date.parse(String(b.updatedAt)) - Date.parse(String(a.updatedAt)))
      .slice(0, 30);

    const rankedAssets = assets
      .map((asset) => ({
        ...asset,
        type: "asset",
        rank: {
          score: q && asset.fileName.toLowerCase().includes(q.toLowerCase()) ? 35 : 5,
          reasons: q && asset.fileName.toLowerCase().includes(q.toLowerCase()) ? ["filename"] : ["recent asset"]
        },
        snippet: this.snippet(asset.fileName, q)
      }))
      .sort((a, b) => b.rank.score - a.rank.score || Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)));

    return {
      query: q,
      manuals: rankedManuals,
      assets: rankedAssets,
      facets: {
        spaces: this.spaceFacets(rankedManuals),
        tags: this.tagFacets(rankedManuals),
        visibility: this.visibilityFacets(rankedManuals),
        types: [
          { value: "manual", label: "Manuals", count: rankedManuals.length },
          { value: "asset", label: "Assets", count: rankedAssets.length }
        ]
      }
    };
  }

  private matchedPages(pages: Array<{ id: string; title: string; slug: string; contentPlain: string | null }>, q: string) {
    const normalized = q.toLowerCase();
    return pages
      .filter((page) => {
        if (!normalized) return true;
        return [page.title, page.contentPlain].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized));
      })
      .slice(0, 5)
      .map((page) => ({
        id: page.id,
        title: page.title,
        slug: page.slug,
        snippet: this.snippet(page.contentPlain || page.title, q),
        score: this.rankText(page.title, q, 45) + this.rankText(page.contentPlain, q, 20)
      }));
  }

  private snippet(value: string, q: string) {
    const compact = value.replace(/\s+/g, " ").trim();
    if (!compact) return "";
    if (!q) return compact.slice(0, 180);
    const index = compact.toLowerCase().indexOf(q.toLowerCase());
    if (index < 0) return compact.slice(0, 180);
    const start = Math.max(0, index - 70);
    const end = Math.min(compact.length, index + q.length + 110);
    return `${start > 0 ? "... " : ""}${compact.slice(start, end)}${end < compact.length ? " ..." : ""}`;
  }

  private rankManual(manual: { title: string; description: string | null; tags: string[]; matchedPages: Array<{ score: number }> }, q: string) {
    const reasons: string[] = [];
    let score = 10;

    const titleScore = this.rankText(manual.title, q, 80);
    if (titleScore) reasons.push("title");
    score += titleScore;

    const descriptionScore = this.rankText(manual.description, q, 30);
    if (descriptionScore) reasons.push("description");
    score += descriptionScore;

    const tagScore = manual.tags.reduce((total, tag) => total + this.rankText(tag, q, 25), 0);
    if (tagScore) reasons.push("tag");
    score += Math.min(50, tagScore);

    const pageScore = manual.matchedPages.reduce((total, page) => total + page.score, 0);
    if (pageScore) reasons.push("matched page");
    score += Math.min(90, pageScore);

    return { score, reasons: reasons.length ? reasons : ["recent"] };
  }

  private rankText(value: string | null | undefined, q: string, weight: number) {
    if (!q || !value) return 0;
    const normalized = value.toLowerCase();
    const needle = q.toLowerCase();
    if (normalized === needle) return weight;
    if (normalized.startsWith(needle)) return Math.round(weight * 0.8);
    if (normalized.includes(needle)) return Math.round(weight * 0.55);
    return 0;
  }

  private spaceFacets(manuals: Array<{ space: { slug: string; name: string } | null }>) {
    const counts = new Map<string, { value: string; label: string; count: number }>();
    for (const manual of manuals) {
      if (!manual.space) continue;
      const current = counts.get(manual.space.slug) ?? { value: manual.space.slug, label: manual.space.name, count: 0 };
      current.count += 1;
      counts.set(manual.space.slug, current);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  private tagFacets(manuals: Array<{ tags: Array<{ slug: string; name: string }> }>) {
    const counts = new Map<string, { value: string; label: string; count: number }>();
    for (const manual of manuals) {
      for (const tag of manual.tags) {
        const current = counts.get(tag.slug) ?? { value: tag.slug, label: tag.name, count: 0 };
        current.count += 1;
        counts.set(tag.slug, current);
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 20);
  }

  private visibilityFacets(manuals: Array<{ visibility: Visibility }>) {
    const counts = new Map<string, { value: string; label: string; count: number }>();
    for (const manual of manuals) {
      const current = counts.get(manual.visibility) ?? { value: manual.visibility, label: manual.visibility.replace("_", " "), count: 0 };
      current.count += 1;
      counts.set(manual.visibility, current);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }
}
