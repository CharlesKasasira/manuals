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
            take: 30,
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

    return {
      manuals: manuals.map((manual) => ({
        ...manual,
        type: "manual",
        tags: manual.tags.map((item) => item.tag),
        matchedPages: this.matchedPages(manual.pages, q)
      })),
      assets: assets.map((asset) => ({ ...asset, type: "asset" }))
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
        snippet: this.snippet(page.contentPlain || page.title, q)
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
}
