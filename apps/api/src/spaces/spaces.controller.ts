import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/roles.decorator";
import { AuditService } from "../common/audit.service";
import { CurrentUser } from "../common/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "space";
}

@Controller("spaces")
export class SpacesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  async list() {
    return { data: await this.prisma.space.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) };
  }

  @Roles(Role.admin, Role.manager)
  @Post()
  async create(@CurrentUser() user: any, @Body() body: { name: string; description?: string; sortOrder?: number }) {
    const space = await this.prisma.space.create({
      data: {
        name: body.name,
        slug: slugify(body.name),
        description: body.description ?? null,
        sortOrder: body.sortOrder ?? 0
      }
    });
    await this.audit.record({ event: "manual_updated", actorId: user.id, entityType: "space", entityId: space.id });
    return { data: space };
  }

  @Roles(Role.admin)
  @Patch(":id")
  async update(@CurrentUser() user: any, @Param("id") id: string, @Body() body: { name?: string; description?: string; isActive?: boolean; sortOrder?: number }) {
    const space = await this.prisma.space.update({
      where: { id },
      data: {
        name: body.name,
        slug: body.name ? slugify(body.name) : undefined,
        description: body.description,
        isActive: body.isActive,
        sortOrder: body.sortOrder
      }
    });
    await this.audit.record({ event: "manual_updated", actorId: user.id, entityType: "space", entityId: space.id });
    return { data: space };
  }
}
