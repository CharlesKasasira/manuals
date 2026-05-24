import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/current-user.decorator";
import { Roles } from "../common/roles.decorator";
import { CreatePageDto, PageAssignmentDto, PageCommentDto, ReorderPagesDto, UpdatePageCommentDto, UpdatePageDto } from "./manuals.dto";
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

  @Patch("pages/:id/assignment")
  @Roles(Role.manager, Role.admin)
  async assignPage(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: PageAssignmentDto) {
    return { data: await this.manuals.assignPage(user, id, dto) };
  }

  @Get("pages/:id/comments")
  async comments(@CurrentUser() user: any, @Param("id") id: string) {
    return { data: await this.manuals.pageComments(user, id) };
  }

  @Post("pages/:id/comments")
  @Roles(Role.manager, Role.admin)
  async createComment(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: PageCommentDto) {
    return { data: await this.manuals.createPageComment(user, id, dto) };
  }

  @Patch("pages/:id/comments/:commentId")
  @Roles(Role.manager, Role.admin)
  async updateComment(@CurrentUser() user: any, @Param("id") id: string, @Param("commentId") commentId: string, @Body() dto: UpdatePageCommentDto) {
    return { data: await this.manuals.updatePageComment(user, id, commentId, dto) };
  }

  @Post("pages/:id/reorder")
  @Roles(Role.manager, Role.admin)
  async reorder(@CurrentUser() user: any, @Body() dto: ReorderPagesDto) {
    return { data: await this.manuals.reorderPages(user, dto) };
  }
}
