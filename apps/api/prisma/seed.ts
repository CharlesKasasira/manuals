import { ManualStatus, PermissionAction, PrismaClient, Role, Visibility } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Manuals123!", 12);
  const nextReviewDueAt = new Date();
  nextReviewDueAt.setDate(nextReviewDueAt.getDate() + 90);

  const admin = await prisma.user.upsert({
    where: { email: "admin@manualflow.local" },
    update: {},
    create: {
      email: "admin@manualflow.local",
      name: "Manuals Admin",
      role: Role.admin,
      passwordHash
    }
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@manualflow.local" },
    update: {},
    create: {
      email: "manager@manualflow.local",
      name: "Manuals Manager",
      role: Role.manager,
      passwordHash
    }
  });

  const operationsTeam = await prisma.team.upsert({
    where: { slug: "operations-team" },
    update: {},
    create: {
      name: "Operations Team",
      slug: "operations-team",
      description: "Managers and contributors responsible for operational manuals.",
      ownerId: manager.id
    }
  });

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: operationsTeam.id, userId: manager.id } },
    update: { role: "owner" },
    create: { teamId: operationsTeam.id, userId: manager.id, role: "owner" }
  });

  const space = await prisma.space.upsert({
    where: { slug: "operations" },
    update: {},
    create: {
      name: "Operations",
      slug: "operations",
      description: "Operational systems, policies, and application runbooks.",
      sortOrder: 1
    }
  });

  const manual = await prisma.manual.upsert({
    where: { slug: "network-operations-manual" },
    update: {},
    create: {
      title: "Network Operations Manual",
      slug: "network-operations-manual",
      description: "A sample published manual showing structured pages, assets, and governance metadata.",
      ownerId: manager.id,
      spaceId: space.id,
      status: ManualStatus.published,
      visibility: Visibility.public,
      reviewState: "approved",
      publishedAt: new Date(),
      lastReviewedAt: new Date(),
      nextReviewDueAt,
      version: 1
    }
  });

  const page = await prisma.manualPage.upsert({
    where: { manualId_slug: { manualId: manual.id, slug: "getting-started" } },
    update: {},
    create: {
      manualId: manual.id,
      title: "Getting Started",
      slug: "getting-started",
      status: ManualStatus.published,
      sortOrder: 1,
      createdById: manager.id,
      updatedById: admin.id,
      draftMarkdown: "# Getting Started\n\n## Purpose\n\nUse this manual to keep operational procedures consistent.\n\n## Scope\n\n- System application support\n- Policy documentation\n- Network operations procedures",
      publishedMarkdown: "# Getting Started\n\n## Purpose\n\nUse this manual to keep operational procedures consistent.\n\n## Scope\n\n- System application support\n- Policy documentation\n- Network operations procedures",
      draftContentHtml: "<h1>Getting Started</h1><h2>Purpose</h2><p>Use this manual to keep operational procedures consistent.</p><h2>Scope</h2><ul><li>System application support</li><li>Policy documentation</li><li>Network operations procedures</li></ul>",
      publishedContentHtml: "<h1>Getting Started</h1><h2>Purpose</h2><p>Use this manual to keep operational procedures consistent.</p><h2>Scope</h2><ul><li>System application support</li><li>Policy documentation</li><li>Network operations procedures</li></ul>",
      contentPlain: "Getting Started Purpose Use this manual to keep operational procedures consistent. Scope System application support Policy documentation Network operations procedures"
    }
  });

  await prisma.manualPage.upsert({
    where: { manualId_slug: { manualId: manual.id, slug: "incident-response" } },
    update: {},
    create: {
      manualId: manual.id,
      title: "Incident Response",
      slug: "incident-response",
      status: ManualStatus.published,
      sortOrder: 2,
      createdById: manager.id,
      updatedById: admin.id,
      draftMarkdown: "# Incident Response\n\n## Triage\n\nClassify incidents by customer impact, service criticality, and current workaround availability.\n\n## Communications\n\nOpen an incident record, assign an owner, and publish status updates at agreed intervals.\n\n## Closure\n\nRecord the root cause, customer impact, corrective actions, and follow-up owner before closure.",
      publishedMarkdown: "# Incident Response\n\n## Triage\n\nClassify incidents by customer impact, service criticality, and current workaround availability.\n\n## Communications\n\nOpen an incident record, assign an owner, and publish status updates at agreed intervals.\n\n## Closure\n\nRecord the root cause, customer impact, corrective actions, and follow-up owner before closure.",
      draftContentHtml: "<h1>Incident Response</h1><h2>Triage</h2><p>Classify incidents by customer impact, service criticality, and current workaround availability.</p><h2>Communications</h2><p>Open an incident record, assign an owner, and publish status updates at agreed intervals.</p><h2>Closure</h2><p>Record the root cause, customer impact, corrective actions, and follow-up owner before closure.</p>",
      publishedContentHtml: "<h1>Incident Response</h1><h2>Triage</h2><p>Classify incidents by customer impact, service criticality, and current workaround availability.</p><h2>Communications</h2><p>Open an incident record, assign an owner, and publish status updates at agreed intervals.</p><h2>Closure</h2><p>Record the root cause, customer impact, corrective actions, and follow-up owner before closure.</p>",
      contentPlain: "Incident Response Triage Classify incidents by customer impact service criticality and current workaround availability Communications Open an incident record assign an owner and publish status updates at agreed intervals Closure Record the root cause customer impact corrective actions and follow-up owner before closure"
    }
  });

  await prisma.manualPage.upsert({
    where: { manualId_slug: { manualId: manual.id, slug: "change-control" } },
    update: {},
    create: {
      manualId: manual.id,
      title: "Change Control",
      slug: "change-control",
      status: ManualStatus.published,
      sortOrder: 3,
      createdById: manager.id,
      updatedById: admin.id,
      draftMarkdown: "# Change Control\n\n## Request\n\nDocument scope, risk, rollback plan, validation steps, and implementation window.\n\n## Approval\n\nRoute high-impact changes through manager review before implementation.\n\n## Verification\n\nConfirm service health, attach evidence, and update the manual when a process changes.",
      publishedMarkdown: "# Change Control\n\n## Request\n\nDocument scope, risk, rollback plan, validation steps, and implementation window.\n\n## Approval\n\nRoute high-impact changes through manager review before implementation.\n\n## Verification\n\nConfirm service health, attach evidence, and update the manual when a process changes.",
      draftContentHtml: "<h1>Change Control</h1><h2>Request</h2><p>Document scope, risk, rollback plan, validation steps, and implementation window.</p><h2>Approval</h2><p>Route high-impact changes through manager review before implementation.</p><h2>Verification</h2><p>Confirm service health, attach evidence, and update the manual when a process changes.</p>",
      publishedContentHtml: "<h1>Change Control</h1><h2>Request</h2><p>Document scope, risk, rollback plan, validation steps, and implementation window.</p><h2>Approval</h2><p>Route high-impact changes through manager review before implementation.</p><h2>Verification</h2><p>Confirm service health, attach evidence, and update the manual when a process changes.</p>",
      contentPlain: "Change Control Request Document scope risk rollback plan validation steps and implementation window Approval Route high-impact changes through manager review before implementation Verification Confirm service health attach evidence and update the manual when a process changes"
    }
  });

  const tag = await prisma.tag.upsert({
    where: { slug: "operations" },
    update: {},
    create: { name: "Operations", slug: "operations", color: "emerald" }
  });

  await prisma.manualTag.upsert({
    where: { manualId_tagId: { manualId: manual.id, tagId: tag.id } },
    update: {},
    create: { manualId: manual.id, tagId: tag.id }
  });

  for (const name of ["Runbook", "Incident Response", "Change Control"]) {
    const extraTag = await prisma.tag.upsert({
      where: { slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") },
      update: {},
      create: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), color: "sky" }
    });
    await prisma.manualTag.upsert({
      where: { manualId_tagId: { manualId: manual.id, tagId: extraTag.id } },
      update: {},
      create: { manualId: manual.id, tagId: extraTag.id }
    });
  }

  await prisma.manualVersion.upsert({
    where: { manualId_version: { manualId: manual.id, version: 1 } },
    update: {},
    create: {
      manualId: manual.id,
      version: 1,
      publishedBy: admin.id,
      snapshot: {
        manual: { title: manual.title, slug: manual.slug, visibility: manual.visibility },
        pages: [{ title: page.title, slug: page.slug }]
      }
    }
  });

  await prisma.permissionGrant.upsert({
    where: { id: "seed-operations-team-read" },
    update: {},
    create: {
      id: "seed-operations-team-read",
      manualId: manual.id,
      teamId: operationsTeam.id,
      action: PermissionAction.read
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
