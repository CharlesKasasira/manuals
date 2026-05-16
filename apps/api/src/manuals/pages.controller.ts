import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/current-user.decorator";
import { Roles } from "../common/roles.decorator";
import { CreatePageDto, ReorderPagesDto, UpdatePageDto } from "./manuals.dto";
import { ManualsService } from "./manuals.service";

@Controller()
export class PagesController {
  constructor(private readonly manuals: ManualsService) {}

  @Get("manuals/:manualId/pages")
  async listPages(@CurrentUser() user: any, @Param("manualId") manualId: string) {
    return { data: await this.manuals.listPages(user, manualId) };
  }

  @Post("manuals/:manualId/pages")
  @Roles(Role.manager, Role.admin)
  async createPage(@CurrentUser() user: any, @Param("manualId") manualId: string, @Body() dto: CreatePageDto) {
    return { data: await this.manuals.createPage(user, manualId, dto) };
  }

  @Patch("pages/:id")
  @Roles(Role.manager, Role.admin)
  async updatePage(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: UpdatePageDto) {
    return { data: await this.manuals.updatePage(user, id, dto) };
  }

  @Delete("pages/:id")
  @Roles(Role.manager, Role.admin)
  async deletePage(@CurrentUser() user: any, @Param("id") id: string) {
    return { data: await this.manuals.deletePage(user, id) };
  }

  @Post("pages/:id/reorder")
  @Roles(Role.manager, Role.admin)
  async reorder(@CurrentUser() user: any, @Body() dto: ReorderPagesDto) {
    return { data: await this.manuals.reorderPages(user, dto) };
  }
}
