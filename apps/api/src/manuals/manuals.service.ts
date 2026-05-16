import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ManualStatus, Prisma, ReviewDecision, ReviewState, Role, Visibility } from "@prisma/client";
import { AuditService } from "../common/audit.service";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateManualDto,
  CreatePageDto,
  FeedbackDto,
  ListManualsDto,
  ReorderPagesDto,
  ReviewCommentDto,
  ShareManualEmailDto,
  UpdateManualDto,
  UpdatePageDto
} from "./manuals.dto";

type Actor = { id: string; role: Role } | null;

const manualInclude = {
  owner: { select: { id: true, name: true, email: true, role: true } },
  space: true,
  tags: { include: { tag: true } },
  pages: { orderBy: [{ parentId: "asc" as const }, { sortOrder: "asc" as const }, { title: "asc" as const }] },
  _count: { select: { feedback: true, follows: true, bookmarks: true } }
};

@Injectable()
export class ManualsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly mail: MailService) {}

  async list(actor: Actor, filters: ListManualsDto = {}) {
    const where: Prisma.ManualWhereInput = {
      deletedAt: null,
      AND: [this.visibilityWhere(actor)]
    };

    if (filters.status) {
      where.status = filters.status;
    } else if (!actor || actor.role === Role.user) {
      where.status = ManualStatus.published;
    }
    if (filters.visibility) where.visibility = filters.visibility;
    if (filters.space) where.space = { slug: filters.space };
    if (filters.tag) {
      where.tags = { some: { tag: { OR: [{ slug: filters.tag }, { name: { contains: filters.tag } }] } } };
    }
    if (filters.search) {
      const q = filters.search;
      const and = Array.isArray(where.AND) ? where.AND : [];
      and.push({ OR: [
        { title: { contains: q } },
        { description: { contains: q } },
        { pages: { some: { OR: [{ title: { contains: q } }, { contentPlain: { contains: q } }] } } },
        { tags: { some: { tag: { OR: [{ name: { contains: q } }, { slug: { contains: q } }] } } } }
      ] });
      where.AND = and;
    }

    const manuals = await this.prisma.manual.findMany({
      where,
      include: manualInclude,
      orderBy: [{ updatedAt: "desc" }],
      take: 100
    });
    return manuals.map((manual) => this.serializeManual(manual));
  }

  async publicList(filters: ListManualsDto = {}) {
    return this.list(null, { ...filters, status: ManualStatus.published, visibility: Visibility.public });
  }

  async getBySlug(actor: Actor, slug: string) {
    const manual = await this.prisma.manual.findFirst({
      where: { slug, deletedAt: null, ...this.visibilityWhere(actor) },
      include: manualInclude
    });
    if (!manual) throw new NotFoundException("Manual not found.");
    if (!this.canManageAll(actor) && manual.status !== ManualStatus.published && manual.ownerId !== actor?.id) {
      throw new NotFoundException("Manual not found.");
    }

    if (actor?.id) {
      await this.prisma.manual.update({ where: { id: manual.id }, data: { viewCount: { increment: 1 } } });
    }
    return this.serializeManual(manual);
  }

  async create(actor: NonNullable<Actor>, dto: CreateManualDto) {
    this.assertManager(actor);
    const manual = await this.prisma.manual.create({
      data: {
        title: dto.title,
        slug: await this.uniqueManualSlug(this.slugify(dto.title)),
        description: dto.description ?? null,
        ownerId: actor.id,
        spaceId: dto.spaceId,
        visibility: dto.visibility ?? Visibility.internal,
        status: ManualStatus.draft,
        reviewState: ReviewState.none
      },
      include: manualInclude
    });
    await this.syncTags(manual.id, dto.tagNames ?? []);
    await this.audit.record({ event: "manual_created", actorId: actor.id, entityType: "manual", entityId: manual.id });
    return this.getBySlug(actor, manual.slug);
  }

  async update(actor: NonNullable<Actor>, id: string, dto: UpdateManualDto) {
    const manual = await this.requireManualForWrite(actor, id);
    const titleChanged = dto.title && dto.title !== manual.title;
    const data: Prisma.ManualUpdateInput = {
      title: dto.title,
      description: dto.description,
      space: dto.spaceId ? { connect: { id: dto.spaceId } } : undefined,
      visibility: dto.visibility,
      slug: titleChanged ? await this.uniqueManualSlug(this.slugify(dto.title!), id) : undefined
    };
    const updated = await this.prisma.manual.update({ where: { id }, data, include: manualInclude });
    if (dto.tagNames) await this.syncTags(id, dto.tagNames);
    await this.audit.record({
      event: dto.visibility && dto.visibility !== manual.visibility ? "visibility_changed" : "manual_updated",
      actorId: actor.id,
      entityType: "manual",
      entityId: id,
      metadata: { visibility: dto.visibility }
    });
    return this.getBySlug(actor, updated.slug);
  }

  async remove(actor: NonNullable<Actor>, id: string) {
    await this.requireManualForWrite(actor, id);
    await this.prisma.manual.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ event: "manual_deleted", actorId: actor.id, entityType: "manual", entityId: id });
    return { ok: true };
  }

  async submitReview(actor: NonNullable<Actor>, id: string, dto: ReviewCommentDto) {
    await this.requireManualForWrite(actor, id);
    await this.prisma.$transaction([
      this.prisma.manual.update({ where: { id }, data: { status: ManualStatus.in_review, reviewState: ReviewState.pending } }),
      this.prisma.reviewRequest.create({
        data: { manualId: id, requestedById: actor.id, decision: ReviewDecision.submitted, comment: dto.comment ?? null }
      })
    ]);
    await this.audit.record({ event: "manual_submitted_for_review", actorId: actor.id, entityType: "manual", entityId: id });
    return this.getById(actor, id);
  }

  async approve(actor: NonNullable<Actor>, id: string, dto: ReviewCommentDto) {
    this.assertManager(actor);
    await this.prisma.$transaction([
      this.prisma.manual.update({ where: { id }, data: { status: ManualStatus.approved, reviewState: ReviewState.approved, lastReviewedAt: new Date() } }),
      this.prisma.reviewRequest.create({
        data: { manualId: id, requestedById: actor.id, reviewerId: actor.id, decision: ReviewDecision.approved, comment: dto.comment ?? null, decidedAt: new Date() }
      })
    ]);
    await this.audit.record({ event: "manual_approved", actorId: actor.id, entityType: "manual", entityId: id });
    return this.getById(actor, id);
  }

  async requestChanges(actor: NonNullable<Actor>, id: string, dto: ReviewCommentDto) {
    this.assertManager(actor);
    await this.prisma.$transaction([
      this.prisma.manual.update({ where: { id }, data: { status: ManualStatus.draft, reviewState: ReviewState.changes_requested } }),
      this.prisma.reviewRequest.create({
        data: { manualId: id, requestedById: actor.id, reviewerId: actor.id, decision: ReviewDecision.changes_requested, comment: dto.comment ?? null, decidedAt: new Date() }
      })
    ]);
    return this.getById(actor, id);
  }

  async publish(actor: NonNullable<Actor>, id: string) {
    this.assertManager(actor);
    const manual = await this.prisma.manual.findUnique({ where: { id }, include: { pages: true } });
    if (!manual) throw new NotFoundException("Manual not found.");
    if (manual.status === ManualStatus.archived) throw new BadRequestException("Archived manuals cannot be published.");
    if (!this.hasPublishableChanges(manual)) {
      throw new BadRequestException("Manual is already published with no unpublished changes.");
    }
    const nextVersion = manual.version + 1;

    await this.prisma.$transaction(async (tx) => {
      for (const page of manual.pages) {
        await tx.manualPage.update({
          where: { id: page.id },
          data: {
            status: ManualStatus.published,
            publishedContentJson: (page.draftContentJson ?? page.publishedContentJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            publishedContentHtml: page.draftContentHtml ?? page.publishedContentHtml,
            publishedMarkdown: page.draftMarkdown ?? page.publishedMarkdown
          }
        });
      }
      await tx.manual.update({
        where: { id },
        data: {
          status: ManualStatus.published,
          reviewState: ReviewState.approved,
          version: nextVersion,
          publishedAt: new Date()
        }
      });
      const version = await tx.manualVersion.create({
        data: { manualId: id, version: nextVersion, publishedBy: actor.id, snapshot: { manual, pages: manual.pages } }
      });
      await tx.manual.update({ where: { id }, data: { publishedVersionId: version.id } });
    });

    await this.audit.record({ event: "manual_published", actorId: actor.id, entityType: "manual", entityId: id });
    await this.prisma.notificationOutbox.create({
      data: { event: "manual_published", payload: { manualId: id, version: nextVersion } }
    });
    return this.getById(actor, id);
  }

  private hasPublishableChanges(manual: Prisma.ManualGetPayload<{ include: { pages: true } }>) {
    if (manual.status !== ManualStatus.published) return true;
    return manual.pages.some((page) => {
      const nextPublishedJson = page.draftContentJson ?? page.publishedContentJson ?? null;
      const currentPublishedJson = page.publishedContentJson ?? null;
      const nextPublishedHtml = page.draftContentHtml ?? page.publishedContentHtml ?? null;
      const currentPublishedHtml = page.publishedContentHtml ?? null;
      const nextPublishedMarkdown = page.draftMarkdown ?? page.publishedMarkdown ?? null;
      const currentPublishedMarkdown = page.publishedMarkdown ?? null;

      return page.status !== ManualStatus.published ||
        !this.jsonEqual(nextPublishedJson, currentPublishedJson) ||
        nextPublishedHtml !== currentPublishedHtml ||
        nextPublishedMarkdown !== currentPublishedMarkdown;
    });
  }

  private jsonEqual(left: Prisma.JsonValue | null, right: Prisma.JsonValue | null) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  async archive(actor: NonNullable<Actor>, id: string) {
    await this.requireManualForWrite(actor, id);
    await this.prisma.manual.update({ where: { id }, data: { status: ManualStatus.archived, archivedAt: new Date() } });
    await this.audit.record({ event: "manual_archived", actorId: actor.id, entityType: "manual", entityId: id });
    return this.getById(actor, id);
  }

  async listPages(actor: NonNullable<Actor>, manualId: string) {
    await this.requireManualReadable(actor, manualId);
    return this.prisma.manualPage.findMany({ where: { manualId }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  }

  async createPage(actor: NonNullable<Actor>, manualId: string, dto: CreatePageDto) {
    await this.requireManualForWrite(actor, manualId);
    const page = await this.prisma.manualPage.create({
      data: {
        manualId,
        title: dto.title,
        slug: await this.uniquePageSlug(manualId, this.slugify(dto.title)),
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        draftContentJson: dto.contentJson as Prisma.InputJsonValue | undefined,
        draftContentHtml: dto.contentHtml ?? null,
        draftMarkdown: dto.markdown ?? null,
        contentPlain: this.toPlainText(dto.markdown ?? dto.contentHtml ?? dto.title),
        createdById: actor.id,
        updatedById: actor.id
      }
    });
    await this.audit.record({ event: "manual_updated", actorId: actor.id, entityType: "page", entityId: page.id });
    return page;
  }

  async updatePage(actor: NonNullable<Actor>, pageId: string, dto: UpdatePageDto) {
    const page = await this.prisma.manualPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException("Page not found.");
    await this.requireManualForWrite(actor, page.manualId);
    return this.prisma.manualPage.update({
      where: { id: pageId },
      data: {
        title: dto.title,
        slug: dto.title && dto.title !== page.title ? await this.uniquePageSlug(page.manualId, this.slugify(dto.title), pageId) : undefined,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder,
        draftContentJson: dto.contentJson as Prisma.InputJsonValue | undefined,
        draftContentHtml: dto.contentHtml,
        draftMarkdown: dto.markdown,
        contentPlain: this.toPlainText(dto.markdown ?? dto.contentHtml ?? dto.title ?? page.title),
        updatedById: actor.id,
        status: ManualStatus.draft
      }
    });
  }

  async reorderPages(actor: NonNullable<Actor>, dto: ReorderPagesDto) {
    const first = dto.pages[0];
    if (!first) return { ok: true };
    const page = await this.prisma.manualPage.findUnique({ where: { id: first.id } });
    if (!page) throw new NotFoundException("Page not found.");
    await this.requireManualForWrite(actor, page.manualId);
    await this.prisma.$transaction(dto.pages.map((item) => this.prisma.manualPage.update({
      where: { id: item.id },
      data: { parentId: item.parentId ?? null, sortOrder: item.sortOrder }
    })));
    return { ok: true };
  }

  async deletePage(actor: NonNullable<Actor>, pageId: string) {
    const page = await this.prisma.manualPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException("Page not found.");
    await this.requireManualForWrite(actor, page.manualId);
    await this.prisma.manualPage.delete({ where: { id: pageId } });
    return { ok: true };
  }

  async feedback(actor: Actor, manualId: string, dto: FeedbackDto) {
    await this.requireManualReadable(actor, manualId);
    return this.prisma.feedback.create({
      data: { manualId, userId: actor?.id ?? null, isHelpful: dto.isHelpful ?? null, comment: dto.comment ?? null }
    });
  }

  async bookmark(actor: NonNullable<Actor>, manualId: string) {
    await this.requireManualReadable(actor, manualId);
    return this.prisma.bookmark.upsert({
      where: { userId_manualId: { userId: actor.id, manualId } },
      update: {},
      create: { userId: actor.id, manualId }
    });
  }

  async follow(actor: NonNullable<Actor>, manualId: string) {
    await this.requireManualReadable(actor, manualId);
    return this.prisma.follow.upsert({
      where: { userId_manualId: { userId: actor.id, manualId } },
      update: {},
      create: { userId: actor.id, manualId }
    });
  }

  async requestAccess(actor: NonNullable<Actor>, manualId: string) {
    await this.prisma.notificationOutbox.create({ data: { userId: actor.id, event: "access_requested", payload: { manualId } } });
    return { ok: true };
  }

  async shareEmail(actor: NonNullable<Actor>, manualId: string, dto: ShareManualEmailDto) {
    const manual = await this.requireManualReadable(actor, manualId);
    const sender = actor.id ? await this.prisma.user.findUnique({ where: { id: actor.id }, select: { name: true, email: true } }) : null;
    const url = this.mail.appUrl(`/manuals/${manual.slug}`);
    const intro = sender ? `${sender.name} shared a manual with you.` : "A manual was shared with you.";
    const message = dto.message?.trim();

    await this.mail.sendMail({
      to: dto.recipientEmail,
      subject: `Manual shared: ${manual.title}`,
      text: [intro, message, `${manual.title}: ${url}`].filter(Boolean).join("\n\n"),
      html: [
        `<p>${this.escapeHtml(intro)}</p>`,
        message ? `<p>${this.escapeHtml(message)}</p>` : "",
        `<p><a href="${url}">${this.escapeHtml(manual.title)}</a></p>`
      ].filter(Boolean).join("")
    });
    await this.audit.record({ event: "manual_shared_email", actorId: actor.id, entityType: "manual", entityId: manualId, metadata: { recipientEmail: dto.recipientEmail } });
    return { ok: true };
  }

  async getById(actor: Actor, id: string) {
    const manual = await this.prisma.manual.findUnique({ where: { id }, include: manualInclude });
    if (!manual || manual.deletedAt) throw new NotFoundException("Manual not found.");
    return this.serializeManual(manual);
  }

  visibilityWhere(actor: Actor): Prisma.ManualWhereInput {
    if (this.canManageAll(actor)) return {};
    if (!actor) return { visibility: Visibility.public, status: ManualStatus.published };
    if (actor.role === Role.manager) {
      return {
        OR: [
          { status: ManualStatus.published, visibility: { in: [Visibility.public, Visibility.internal] } },
          { ownerId: actor.id },
          { permissions: { some: { userId: actor.id, action: "read" } } },
          { permissions: { some: { team: { members: { some: { userId: actor.id } } }, action: "read" } } },
          { permissions: { some: { role: actor.role, action: "read" } } }
        ]
      };
    }
    return {
      OR: [
        { status: ManualStatus.published, visibility: { in: [Visibility.public, Visibility.internal] } },
        { permissions: { some: { userId: actor.id, action: "read" } } },
        { permissions: { some: { team: { members: { some: { userId: actor.id } } }, action: "read" } } },
        { permissions: { some: { role: actor.role, action: "read" } } }
      ]
    };
  }

  readableManualWhere(actor: Actor): Prisma.ManualWhereInput {
    const where: Prisma.ManualWhereInput = {
      deletedAt: null,
      AND: [this.visibilityWhere(actor)]
    };
    if (!this.canManageAll(actor)) {
      where.OR = [{ status: ManualStatus.published }, { ownerId: actor?.id ?? "__no_actor__" }];
    }
    return where;
  }

  canManageAll(actor: Actor) {
    return actor?.role === Role.admin;
  }

  assertManager(actor: Actor): asserts actor is NonNullable<Actor> {
    if (!actor || (actor.role !== Role.admin && actor.role !== Role.manager)) throw new ForbiddenException("Manager or admin access required.");
  }

  async requireManualForWrite(actor: NonNullable<Actor>, manualId: string) {
    const manual = await this.prisma.manual.findUnique({ where: { id: manualId } });
    if (!manual || manual.deletedAt) throw new NotFoundException("Manual not found.");
    if (actor.role === Role.admin || manual.ownerId === actor.id) return manual;
    const permitted = await this.prisma.permissionGrant.findFirst({
      where: { manualId, OR: [{ userId: actor.id }, { role: actor.role }], action: { in: ["contribute", "publish", "administer"] } }
    });
    if (!permitted) throw new ForbiddenException("You cannot modify this manual.");
    return manual;
  }

  async requireManualReadable(actor: Actor, manualId: string) {
    const manual = await this.prisma.manual.findFirst({ where: { id: manualId, ...this.readableManualWhere(actor) } });
    if (!manual) throw new NotFoundException("Manual not found.");
    return manual;
  }

  async syncTags(manualId: string, tagNames: string[]) {
    await this.prisma.manualTag.deleteMany({ where: { manualId } });
    for (const raw of tagNames.map((name) => name.trim()).filter(Boolean)) {
      const slug = this.slugify(raw);
      const tag = await this.prisma.tag.upsert({
        where: { slug },
        update: { name: raw },
        create: { name: raw, slug }
      });
      await this.prisma.manualTag.create({ data: { manualId, tagId: tag.id } });
    }
  }

  serializeManual(manual: any) {
    const pages = manual.pages ?? [];
    return {
      ...manual,
      tags: (manual.tags ?? []).map((item: any) => item.tag ?? item),
      tableOfContents: this.buildTree(pages),
      knowledgeSignals: this.buildKnowledgeSignals(manual, pages)
    };
  }

  buildKnowledgeSignals(manual: any, pages: any[]) {
    const plainText = pages.map((page) => page.contentPlain || page.draftMarkdown || page.publishedMarkdown || "").join(" ");
    const words = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
    const publishedPages = pages.filter((page) => page.status === ManualStatus.published).length;
    const emptyPages = pages.filter((page) => !String(page.contentPlain || page.draftMarkdown || page.publishedMarkdown || "").trim()).length;
    const now = Date.now();
    const nextReview = manual.nextReviewDueAt ? new Date(manual.nextReviewDueAt).getTime() : null;
    const lastReviewed = manual.lastReviewedAt ? new Date(manual.lastReviewedAt).getTime() : null;
    const daysUntilReview = nextReview ? Math.ceil((nextReview - now) / 86_400_000) : null;
    const daysSinceReview = lastReviewed ? Math.floor((now - lastReviewed) / 86_400_000) : null;
    const reviewDueStatus = daysUntilReview === null
      ? "not_scheduled"
      : daysUntilReview < 0
        ? "overdue"
        : daysUntilReview <= 30
          ? "due_soon"
          : "current";
    const score = Math.max(0, Math.min(100,
      20 +
      Math.min(pages.length * 8, 24) +
      Math.min(Math.floor(words / 75) * 4, 24) +
      (manual.description ? 8 : 0) +
      ((manual.tags ?? []).length ? 8 : 0) +
      (manual.lastReviewedAt ? 8 : 0) +
      (manual.status === ManualStatus.published ? 8 : 0) -
      emptyPages * 10 -
      (reviewDueStatus === "overdue" ? 12 : 0)
    ));

    return {
      pageCount: pages.length,
      publishedPageCount: publishedPages,
      draftPageCount: pages.length - publishedPages,
      emptyPageCount: emptyPages,
      wordCount: words,
      readingTimeMinutes: Math.max(1, Math.ceil(words / 220)),
      reviewDueStatus,
      daysUntilReview,
      daysSinceReview,
      qualityScore: score
    };
  }

  buildTree(pages: any[]) {
    const nodes = pages.map((page) => ({ ...page, children: [] }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const roots: any[] = [];
    for (const node of nodes) {
      if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId).children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  slugify(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "manual";
  }

  async uniqueManualSlug(base: string, ignoreId?: string) {
    let slug = base;
    let index = 2;
    while (await this.prisma.manual.findFirst({ where: { slug, id: ignoreId ? { not: ignoreId } : undefined } })) {
      slug = `${base}-${index++}`;
    }
    return slug;
  }

  async uniquePageSlug(manualId: string, base: string, ignoreId?: string) {
    let slug = base;
    let index = 2;
    while (await this.prisma.manualPage.findFirst({ where: { manualId, slug, id: ignoreId ? { not: ignoreId } : undefined } })) {
      slug = `${base}-${index++}`;
    }
    return slug;
  }

  toPlainText(value: string) {
    return value.replace(/<[^>]*>/g, " ").replace(/[#*_`~>[\]()]/g, " ").replace(/\s+/g, " ").trim();
  }

  escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char] ?? char));
  }
}
