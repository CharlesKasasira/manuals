import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ManualStatus, PageCommentKind, PageCommentStatus, PermissionAction, Prisma, ReviewDecision, ReviewState, Role, Visibility } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { AuditService } from "../common/audit.service";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateManualDto,
  CreateShareLinkDto,
  CreatePageDto,
  FeedbackDto,
  ListManualsDto,
  PageAssignmentDto,
  PageCommentDto,
  ReorderPagesDto,
  ReviewCommentDto,
  ShareManualEmailDto,
  UpdateManualDto,
  UpdatePageCommentDto,
  UpdatePageDto
} from "./manuals.dto";

type Actor = { id: string; role: Role } | null;

const manualInclude = {
  owner: { select: { id: true, name: true, email: true, role: true } },
  space: true,
  tags: { include: { tag: true } },
  pages: {
    orderBy: [{ parentId: "asc" as const }, { sortOrder: "asc" as const }, { title: "asc" as const }],
    include: {
      assignedOwner: { select: { id: true, name: true, email: true, role: true } },
      comments: {
        include: {
          author: { select: { id: true, name: true, email: true, role: true } },
          assignedTo: { select: { id: true, name: true, email: true, role: true } },
          resolvedBy: { select: { id: true, name: true, email: true, role: true } },
          mentions: { include: { user: { select: { id: true, name: true, email: true, role: true } } } }
        },
        orderBy: [{ status: "asc" as const }, { createdAt: "desc" as const }]
      }
    }
  },
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
    const where: Prisma.ManualWhereInput = {
      deletedAt: null,
      status: ManualStatus.published,
      visibility: Visibility.public
    };

    if (filters.space) where.space = { slug: filters.space };
    if (filters.tag) {
      where.tags = { some: { tag: { OR: [{ slug: filters.tag }, { name: { contains: filters.tag } }] } } };
    }
    if (filters.search) {
      const q = filters.search;
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } },
        { pages: { some: { OR: [{ title: { contains: q } }, { contentPlain: { contains: q } }] } } },
        { tags: { some: { tag: { OR: [{ name: { contains: q } }, { slug: { contains: q } }] } } } }
      ];
    }

    const manuals = await this.prisma.manual.findMany({
      where,
      include: manualInclude,
      orderBy: [{ updatedAt: "desc" }],
      take: 100
    });
    return manuals.map((manual) => this.serializeManual(manual));
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
    await this.requireManualWorkflowAccess(actor, id, [PermissionAction.review]);
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
    await this.requireManualWorkflowAccess(actor, id, [PermissionAction.review]);
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
    await this.requireManualWorkflowAccess(actor, id, [PermissionAction.publish]);
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

  async assignPage(actor: NonNullable<Actor>, pageId: string, dto: PageAssignmentDto) {
    const page = await this.prisma.manualPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException("Page not found.");
    await this.requireManualForWrite(actor, page.manualId);
    if (dto.assignedOwnerId) await this.requireActiveUser(dto.assignedOwnerId);
    const updated = await this.prisma.manualPage.update({
      where: { id: pageId },
      data: { assignedOwnerId: dto.assignedOwnerId || null },
      include: { assignedOwner: { select: { id: true, name: true, email: true, role: true } } }
    });
    await this.audit.record({ event: "page_assigned", actorId: actor.id, entityType: "page", entityId: pageId, metadata: { assignedOwnerId: dto.assignedOwnerId || null } });
    if (dto.assignedOwnerId) {
      await this.prisma.notificationOutbox.create({
        data: { userId: dto.assignedOwnerId, event: "page_assigned", payload: { manualId: page.manualId, pageId } }
      });
    }
    return updated;
  }

  async pageComments(actor: NonNullable<Actor>, pageId: string) {
    const page = await this.prisma.manualPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException("Page not found.");
    await this.requireManualReadable(actor, page.manualId);
    return this.prisma.pageComment.findMany({
      where: { pageId },
      include: this.pageCommentInclude(),
      orderBy: [{ status: "asc" }, { createdAt: "desc" }]
    });
  }

  async createPageComment(actor: NonNullable<Actor>, pageId: string, dto: PageCommentDto) {
    const page = await this.prisma.manualPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException("Page not found.");
    await this.requireManualForWrite(actor, page.manualId);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException("Comment body is required.");
    if (dto.assignedToId) await this.requireActiveUser(dto.assignedToId);
    const mentionUserIds = await this.validMentionUserIds(dto.mentionUserIds ?? []);
    const comment = await this.prisma.pageComment.create({
      data: {
        pageId,
        authorId: actor.id,
        body,
        kind: dto.kind ?? PageCommentKind.comment,
        sectionAnchor: dto.sectionAnchor?.trim() || null,
        assignedToId: dto.assignedToId || null,
        mentions: mentionUserIds.length ? { create: mentionUserIds.map((userId) => ({ userId })) } : undefined
      },
      include: this.pageCommentInclude()
    });
    await this.audit.record({ event: "page_comment_created", actorId: actor.id, entityType: "page", entityId: pageId, metadata: { commentId: comment.id, kind: comment.kind } });
    await this.enqueueCommentNotifications(page.manualId, pageId, comment.id, [dto.assignedToId, ...mentionUserIds].filter(Boolean) as string[]);
    return comment;
  }

  async updatePageComment(actor: NonNullable<Actor>, pageId: string, commentId: string, dto: UpdatePageCommentDto) {
    const comment = await this.prisma.pageComment.findUnique({ where: { id: commentId }, include: { page: true } });
    if (!comment || comment.pageId !== pageId) throw new NotFoundException("Comment not found.");
    await this.requireManualForWrite(actor, comment.page.manualId);
    if (dto.assignedToId) await this.requireActiveUser(dto.assignedToId);
    const resolving = dto.status === PageCommentStatus.resolved && comment.status !== PageCommentStatus.resolved;
    const updated = await this.prisma.pageComment.update({
      where: { id: commentId },
      data: {
        status: dto.status,
        assignedToId: dto.assignedToId === undefined ? undefined : dto.assignedToId || null,
        resolvedAt: resolving ? new Date() : dto.status === PageCommentStatus.open ? null : undefined,
        resolvedById: resolving ? actor.id : dto.status === PageCommentStatus.open ? null : undefined
      },
      include: this.pageCommentInclude()
    });
    await this.audit.record({ event: "page_comment_updated", actorId: actor.id, entityType: "page_comment", entityId: commentId, metadata: { status: dto.status, assignedToId: dto.assignedToId } });
    return updated;
  }

  async collaborators(actor: NonNullable<Actor>, manualId: string) {
    const manual = await this.requireManualReadable(actor, manualId);
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [
          { id: manual.ownerId },
          { role: { in: [Role.manager, Role.admin] } },
          { permissionGrants: { some: { manualId } } },
          { teamMemberships: { some: { team: { permissions: { some: { manualId } } } } } }
        ]
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "desc" }, { name: "asc" }]
    });
    return users;
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

  async createShareLink(actor: NonNullable<Actor>, manualId: string, dto: CreateShareLinkDto) {
    const manual = await this.requireManualReadable(actor, manualId);
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + (dto.expiresInDays ?? 7) * 86_400_000);
    const link = await this.prisma.manualShareLink.create({
      data: {
        manualId,
        tokenHash: this.shareTokenHash(token),
        label: dto.label?.trim() || null,
        createdById: actor.id,
        expiresAt
      },
      select: { id: true, label: true, expiresAt: true, createdAt: true }
    });
    await this.audit.record({ event: "private_share_link_created", actorId: actor.id, entityType: "manual", entityId: manual.id, metadata: { linkId: link.id, expiresAt } });
    return { ...link, token, url: this.mail.appUrl(`/share/${token}`) };
  }

  async getByShareToken(token: string) {
    const shareLink = await this.prisma.manualShareLink.findUnique({
      where: { tokenHash: this.shareTokenHash(token) },
      include: { manual: { include: manualInclude } }
    });
    if (!shareLink || shareLink.revokedAt || shareLink.expiresAt.getTime() < Date.now() || shareLink.manual.deletedAt) {
      throw new NotFoundException("Share link not found or expired.");
    }
    await this.prisma.manualShareLink.update({ where: { id: shareLink.id }, data: { lastUsedAt: new Date() } });
    return this.serializeManual(shareLink.manual);
  }

  async offlinePack(actor: Actor, manualId: string, token?: string) {
    const manual = token ? await this.getByShareToken(token) : await this.getById(actor, manualId);
    if (!token) await this.requireManualReadable(actor, manualId);
    return { fileName: `${this.slugify(manual.title)}-offline.html`, html: this.buildOfflineHtml(manual) };
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

  private async requireManualWorkflowAccess(actor: NonNullable<Actor>, manualId: string, actions: PermissionAction[]) {
    const manual = await this.prisma.manual.findUnique({ where: { id: manualId } });
    if (!manual || manual.deletedAt) throw new NotFoundException("Manual not found.");
    if (actor.role === Role.admin || manual.ownerId === actor.id) return manual;

    const allowedActions = Array.from(new Set([...actions, PermissionAction.administer]));
    const permitted = await this.prisma.permissionGrant.findFirst({
      where: {
        manualId,
        action: { in: allowedActions },
        OR: [
          { userId: actor.id },
          { role: actor.role },
          { team: { members: { some: { userId: actor.id } } } }
        ]
      }
    });
    if (!permitted) throw new ForbiddenException("You cannot perform this workflow action on this manual.");
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

  private pageCommentInclude() {
    return {
      author: { select: { id: true, name: true, email: true, role: true } },
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
      resolvedBy: { select: { id: true, name: true, email: true, role: true } },
      mentions: { include: { user: { select: { id: true, name: true, email: true, role: true } } } }
    };
  }

  private async requireActiveUser(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, isActive: true, deletedAt: null }, select: { id: true } });
    if (!user) throw new BadRequestException("Assigned user is not active.");
    return user;
  }

  private async validMentionUserIds(userIds: string[]) {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    if (!uniqueIds.length) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, isActive: true, deletedAt: null },
      select: { id: true }
    });
    return users.map((user) => user.id);
  }

  private async enqueueCommentNotifications(manualId: string, pageId: string, commentId: string, userIds: string[]) {
    const uniqueIds = Array.from(new Set(userIds));
    if (!uniqueIds.length) return;
    await this.prisma.notificationOutbox.createMany({
      data: uniqueIds.map((userId) => ({
        userId,
        event: "page_comment_mentioned",
        payload: { manualId, pageId, commentId }
      }))
    });
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

  private shareTokenHash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private buildOfflineHtml(manual: any) {
    const pages = this.flattenPages(manual.tableOfContents ?? manual.pages ?? []);
    const toc = pages.map((page: any) => `<li><a href="#page-${this.escapeHtml(page.slug)}">${this.escapeHtml(page.title)}</a></li>`).join("");
    const sections = pages.map((page: any) => {
      const body = page.publishedContentHtml || page.draftContentHtml || this.escapeHtml(page.publishedMarkdown || page.draftMarkdown || "No content yet.").replace(/\n/g, "<br>");
      return `<section id="page-${this.escapeHtml(page.slug)}"><h2>${this.escapeHtml(page.title)}</h2>${body}</section>`;
    }).join("\n");

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${this.escapeHtml(manual.title)} Offline Manual</title>
  <style>
    body{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;margin:0;color:#0f172a;background:#f8fafc}
    header{background:#0f172a;color:white;padding:32px}
    main{max-width:1040px;margin:0 auto;padding:24px}
    nav,section{background:white;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:16px}
    h1{margin:0;font-size:32px} h2{border-bottom:1px solid #e2e8f0;padding-bottom:8px}
    p,li{line-height:1.7;color:#334155} a{color:#047857}
    img,video,iframe{max-width:100%;height:auto}
    pre{overflow:auto;background:#0f172a;color:#f8fafc;padding:16px;border-radius:8px}
  </style>
</head>
<body>
  <header><p>ManualFlow Offline Pack</p><h1>${this.escapeHtml(manual.title)}</h1><p>${this.escapeHtml(manual.description || "")}</p></header>
  <main><nav><strong>Contents</strong><ol>${toc}</ol></nav>${sections}</main>
</body>
</html>`;
  }

  private flattenPages(pages: any[] = []): any[] {
    return pages.flatMap((page) => [page, ...this.flattenPages(page.children ?? [])]);
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
