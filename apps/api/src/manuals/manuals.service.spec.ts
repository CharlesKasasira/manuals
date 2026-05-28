import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ManualStatus, PermissionAction, ReviewDecision, ReviewState, Role, Visibility } from "@prisma/client";
import { ManualsService } from "./manuals.service";

describe("ManualsService", () => {
  const actor = { id: "manager-1", role: Role.manager };
  const manual = {
    id: "manual-1",
    title: "Network Manual",
    slug: "network-manual",
    description: null,
    ownerId: actor.id,
    spaceId: "space-1",
    status: ManualStatus.draft,
    visibility: Visibility.internal,
    version: 1,
    reviewState: ReviewState.none,
    deletedAt: null,
    pages: [],
    tags: []
  };

  function makeService(overrides: Record<string, unknown> = {}) {
    let prisma: any;
    prisma = {
      manual: {
        findUnique: jest.fn().mockResolvedValue(manual),
        findFirst: jest.fn().mockResolvedValue(manual),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(manual),
        create: jest.fn()
      },
      reviewRequest: { create: jest.fn() },
      manualVersion: { create: jest.fn().mockResolvedValue({ id: "version-2" }) },
      manualPage: {
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn()
      },
      permissionGrant: { findFirst: jest.fn().mockResolvedValue(null) },
      notificationOutbox: { create: jest.fn() },
      manualTag: { deleteMany: jest.fn(), create: jest.fn() },
      tag: { upsert: jest.fn() },
      feedback: { create: jest.fn() },
      bookmark: { upsert: jest.fn() },
      follow: { upsert: jest.fn() },
      $transaction: jest.fn(async (operations: unknown): Promise<unknown> => {
        if (typeof operations === "function") return operations(prisma);
        return Promise.all(operations as Promise<unknown>[]);
      }),
      ...overrides
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const mail = { sendMail: jest.fn(), appUrl: jest.fn() };
    return { service: new ManualsService(prisma as any, audit as any, mail as any), prisma, audit };
  }

  it("submits an owned manual for review and records the transition", async () => {
    const { service, prisma, audit } = makeService();

    await service.submitReview(actor, manual.id, { comment: "Ready" });

    expect(prisma.manual.update).toHaveBeenCalledWith({
      where: { id: manual.id },
      data: { status: ManualStatus.in_review, reviewState: ReviewState.pending }
    });
    expect(prisma.reviewRequest.create).toHaveBeenCalledWith({
      data: { manualId: manual.id, requestedById: actor.id, decision: ReviewDecision.submitted, comment: "Ready" }
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: "manual_submitted_for_review", actorId: actor.id }));
  });

  it("requires manager/admin role to approve manuals", async () => {
    const { service } = makeService();

    await expect(service.approve({ id: "user-1", role: Role.user }, manual.id, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks a manager from approving a manual without manual-level review access", async () => {
    const otherManual = { ...manual, id: "manual-2", ownerId: "owner-2" };
    const { service, prisma, audit } = makeService({
      manual: {
        findUnique: jest.fn().mockResolvedValue(otherManual),
        findFirst: jest.fn().mockResolvedValue(otherManual),
        update: jest.fn().mockResolvedValue(otherManual),
        findMany: jest.fn().mockResolvedValue([])
      }
    });

    await expect(service.approve(actor, otherManual.id, {})).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.permissionGrant.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        manualId: otherManual.id,
        action: { in: [PermissionAction.review, PermissionAction.administer] }
      })
    }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("blocks a manager from requesting changes without manual-level review access", async () => {
    const otherManual = { ...manual, id: "manual-2", ownerId: "owner-2" };
    const { service, prisma } = makeService({
      manual: {
        findUnique: jest.fn().mockResolvedValue(otherManual),
        findFirst: jest.fn().mockResolvedValue(otherManual),
        update: jest.fn().mockResolvedValue(otherManual),
        findMany: jest.fn().mockResolvedValue([])
      }
    });

    await expect(service.requestChanges(actor, otherManual.id, {})).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.permissionGrant.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        manualId: otherManual.id,
        action: { in: [PermissionAction.review, PermissionAction.administer] }
      })
    }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("publishes pages, bumps version, writes a snapshot, and enqueues notification", async () => {
    const page = {
      id: "page-1",
      draftContentJson: { type: "doc" },
      publishedContentJson: null,
      draftContentHtml: "<p>Draft</p>",
      publishedContentHtml: null,
      draftMarkdown: "# Draft",
      publishedMarkdown: null
    };
    const { service, prisma, audit } = makeService({
      manual: {
        findUnique: jest.fn().mockResolvedValue({ ...manual, status: ManualStatus.approved, pages: [page] }),
        findFirst: jest.fn().mockResolvedValue(manual),
        update: jest.fn().mockResolvedValue(manual),
        findMany: jest.fn().mockResolvedValue([])
      }
    });

    await service.publish(actor, manual.id);

    expect(prisma.manualPage.update).toHaveBeenCalledWith({
      where: { id: page.id },
      data: {
        status: ManualStatus.published,
        publishedContentJson: page.draftContentJson,
        publishedContentHtml: page.draftContentHtml,
        publishedMarkdown: page.draftMarkdown
      }
    });
    expect(prisma.manual.update).toHaveBeenCalledWith({
      where: { id: manual.id },
      data: expect.objectContaining({ status: ManualStatus.published, reviewState: ReviewState.approved, version: 2 })
    });
    expect(prisma.manualVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ manualId: manual.id, version: 2, publishedBy: actor.id })
    });
    expect(prisma.notificationOutbox.create).toHaveBeenCalledWith({
      data: { event: "manual_published", payload: { manualId: manual.id, version: 2 } }
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: "manual_published" }));
  });

  it("exports a readable manual as a real PDF document", async () => {
    const { service } = makeService({
      manual: {
        findUnique: jest.fn().mockResolvedValue({
          ...manual,
          owner: { name: "Manuals Admin" },
          updatedAt: new Date("2026-05-28T00:00:00.000Z"),
          pages: [
            {
              id: "page-1",
              title: "Install",
              slug: "install",
              publishedContentHtml: "<p>Run the installer and verify the service.</p>"
            }
          ]
        }),
        findFirst: jest.fn().mockResolvedValue(manual),
        update: jest.fn(),
        findMany: jest.fn()
      }
    });

    const pdf = await service.pdfExport(actor, manual.id);

    expect(pdf.fileName).toBe("network-manual.pdf");
    expect(pdf.buffer.subarray(0, 8).toString("utf8")).toBe("%PDF-1.4");
    expect(pdf.buffer.toString("utf8")).toContain("/Type /Catalog");
  });

  it("blocks a manager from publishing a manual without manual-level publish access", async () => {
    const otherManual = { ...manual, id: "manual-2", ownerId: "owner-2", status: ManualStatus.approved };
    const { service, prisma, audit } = makeService({
      manual: {
        findUnique: jest.fn().mockResolvedValue(otherManual),
        findFirst: jest.fn().mockResolvedValue(otherManual),
        update: jest.fn().mockResolvedValue(otherManual),
        findMany: jest.fn().mockResolvedValue([])
      }
    });

    await expect(service.publish(actor, otherManual.id)).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.permissionGrant.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        manualId: otherManual.id,
        action: { in: [PermissionAction.publish, PermissionAction.administer] }
      })
    }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.manualVersion.create).not.toHaveBeenCalled();
    expect(prisma.notificationOutbox.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejects publishing an already published manual with no unpublished changes", async () => {
    const page = {
      id: "page-1",
      status: ManualStatus.published,
      draftContentJson: null,
      publishedContentJson: { type: "doc" },
      draftContentHtml: null,
      publishedContentHtml: "<p>Published</p>",
      draftMarkdown: null,
      publishedMarkdown: "# Published"
    };
    const { service, prisma, audit } = makeService({
      manual: {
        findUnique: jest.fn().mockResolvedValue({ ...manual, status: ManualStatus.published, pages: [page] }),
        findFirst: jest.fn().mockResolvedValue(manual),
        update: jest.fn().mockResolvedValue(manual),
        findMany: jest.fn().mockResolvedValue([])
      }
    });

    await expect(service.publish(actor, manual.id)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.manual.update).not.toHaveBeenCalled();
    expect(prisma.manualVersion.create).not.toHaveBeenCalled();
    expect(prisma.notificationOutbox.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("hides unreadable draft manuals from non-owners", async () => {
    const { service, prisma } = makeService({
      manual: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn()
      }
    });

    await expect(service.requireManualReadable({ id: "other-user", role: Role.user }, manual.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.manual.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: manual.id, deletedAt: null })
    });
  });

  it("lists every published public manual for the public library", async () => {
    const manuals = [
      { ...manual, id: "manual-1", title: "Network Manual", slug: "network-manual", status: ManualStatus.published, visibility: Visibility.public },
      { ...manual, id: "manual-2", title: "Policy Manual", slug: "policy-manual", status: ManualStatus.published, visibility: Visibility.public }
    ];
    const { service, prisma } = makeService({
      manual: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue(manuals),
        update: jest.fn(),
        create: jest.fn()
      }
    });

    const result = await service.publicList();

    expect(result).toHaveLength(2);
    expect(prisma.manual.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        deletedAt: null,
        status: ManualStatus.published,
        visibility: Visibility.public
      }
    }));
  });

  it("serializes manual knowledge health signals", () => {
    const { service } = makeService();
    const serialized = service.serializeManual({
      ...manual,
      description: "Operational procedures.",
      status: ManualStatus.published,
      lastReviewedAt: new Date(),
      nextReviewDueAt: new Date(Date.now() + 14 * 86_400_000),
      pages: [
        { id: "page-1", title: "Start", parentId: null, status: ManualStatus.published, contentPlain: "Run a clear operational handover before each maintenance window." },
        { id: "page-2", title: "Empty", parentId: null, status: ManualStatus.draft, contentPlain: "" }
      ],
      tags: [{ tag: { id: "tag-1", name: "Runbook", slug: "runbook" } }]
    }, actor);

    expect(serialized.tags).toEqual([{ id: "tag-1", name: "Runbook", slug: "runbook" }]);
    expect(serialized.knowledgeSignals).toEqual(expect.objectContaining({
      pageCount: 2,
      publishedPageCount: 1,
      draftPageCount: 1,
      emptyPageCount: 1,
      readingTimeMinutes: 1,
      reviewDueStatus: "due_soon"
    }));
    expect(serialized.knowledgeSignals.qualityScore).toBeGreaterThan(0);
  });

  it("hides quality score from public and non-collaborator readers", () => {
    const { service } = makeService();
    const serialized = service.serializeManual({
      ...manual,
      ownerId: "owner-2",
      status: ManualStatus.published,
      visibility: Visibility.public,
      pages: [{ id: "page-1", title: "Start", parentId: null, status: ManualStatus.published, contentPlain: "Useful operational detail." }],
      permissions: []
    }, null);

    expect(serialized.knowledgeSignals.qualityScore).toBeUndefined();
    expect(serialized.permissions).toBeUndefined();
  });

  it("shows quality score to explicit collaborators", () => {
    const { service } = makeService();
    const serialized = service.serializeManual({
      ...manual,
      ownerId: "owner-2",
      status: ManualStatus.published,
      pages: [{ id: "page-1", title: "Start", parentId: null, status: ManualStatus.published, contentPlain: "Useful operational detail." }],
      permissions: [{ userId: actor.id, role: null, team: null }]
    }, actor);

    expect(serialized.knowledgeSignals.qualityScore).toBeGreaterThan(0);
    expect(serialized.permissions).toBeUndefined();
  });
});
