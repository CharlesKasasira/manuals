import { Controller, Get, Param } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/current-user.decorator";
import { ManualsService } from "../manuals/manuals.service";
import { Roles } from "../common/roles.decorator";
import { PrismaService } from "../prisma/prisma.service";

@Controller()
export class GovernanceController {
  constructor(private readonly prisma: PrismaService, private readonly manuals: ManualsService) {}

  @Get("reviews")
  async reviews(@CurrentUser() user: { id: string; role: Role } | null) {
    return {
      data: await this.prisma.reviewRequest.findMany({
        where: { manual: { is: this.manuals.readableManualWhere(user) } },
        include: { manual: true, requestedBy: { select: { id: true, name: true } }, reviewer: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100
      })
    };
  }

  @Roles(Role.admin)
  @Get("audit-logs")
  async auditLogs() {
    return {
      data: await this.prisma.auditLog.findMany({
        include: { actor: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 200
      })
    };
  }

  @Get("analytics/manuals/:id")
  async manualAnalytics(@CurrentUser() user: { id: string; role: Role } | null, @Param("id") id: string) {
    await this.manuals.requireManualReadable(user, id);
    const [manual, feedbackTotal, helpful, bookmarks, follows] = await Promise.all([
      this.prisma.manual.findUnique({ where: { id }, select: { id: true, title: true, viewCount: true, version: true, status: true } }),
      this.prisma.feedback.count({ where: { manualId: id } }),
      this.prisma.feedback.count({ where: { manualId: id, isHelpful: true } }),
      this.prisma.bookmark.count({ where: { manualId: id } }),
      this.prisma.follow.count({ where: { manualId: id } })
    ]);
    return { data: { manual, feedbackTotal, helpful, bookmarks, follows } };
  }
}
