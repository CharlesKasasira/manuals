import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/current-user.decorator";
import { Public } from "../common/public.decorator";
import { Roles } from "../common/roles.decorator";
import { CreateManualDto, CreateShareLinkDto, FeedbackDto, ListManualsDto, ReviewCommentDto, ShareManualEmailDto, UpdateManualDto } from "./manuals.dto";
import { ManualsService } from "./manuals.service";

@Controller("manuals")
export class ManualsController {
  constructor(private readonly manuals: ManualsService) {}

  @Get()
  async list(@CurrentUser() user: any, @Query() query: ListManualsDto) {
    return { data: await this.manuals.list(user, query) };
  }

  @Post()
  @Roles(Role.manager, Role.admin)
  async create(@CurrentUser() user: any, @Body() dto: CreateManualDto) {
    return { data: await this.manuals.create(user, dto) };
  }

  @Get(":slug")
  async show(@CurrentUser() user: any, @Param("slug") slug: string) {
    return { data: await this.manuals.getBySlug(user, slug) };
  }

  @Patch(":id")
  @Roles(Role.manager, Role.admin)
  async update(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: UpdateManualDto) {
    return { data: await this.manuals.update(user, id, dto) };
  }

  @Delete(":id")
  @Roles(Role.manager, Role.admin)
  async remove(@CurrentUser() user: any, @Param("id") id: string) {
    return { data: await this.manuals.remove(user, id) };
  }

  @Post(":id/submit-review")
  @Roles(Role.manager, Role.admin)
  async submitReview(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: ReviewCommentDto) {
    return { data: await this.manuals.submitReview(user, id, dto) };
  }

  @Post(":id/approve")
  @Roles(Role.manager, Role.admin)
  async approve(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: ReviewCommentDto) {
    return { data: await this.manuals.approve(user, id, dto) };
  }

  @Post(":id/request-changes")
  @Roles(Role.manager, Role.admin)
  async requestChanges(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: ReviewCommentDto) {
    return { data: await this.manuals.requestChanges(user, id, dto) };
  }

  @Post(":id/publish")
  @Roles(Role.manager, Role.admin)
  async publish(@CurrentUser() user: any, @Param("id") id: string) {
    return { data: await this.manuals.publish(user, id) };
  }

  @Post(":id/archive")
  @Roles(Role.manager, Role.admin)
  async archive(@CurrentUser() user: any, @Param("id") id: string) {
    return { data: await this.manuals.archive(user, id) };
  }

  @Public()
  @Post(":id/feedback")
  async feedback(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: FeedbackDto) {
    return { data: await this.manuals.feedback(user, id, dto) };
  }

  @Post(":id/bookmark")
  async bookmark(@CurrentUser() user: any, @Param("id") id: string) {
    return { data: await this.manuals.bookmark(user, id) };
  }

  @Post(":id/follow")
  async follow(@CurrentUser() user: any, @Param("id") id: string) {
    return { data: await this.manuals.follow(user, id) };
  }

  @Post(":id/request-access")
  async requestAccess(@CurrentUser() user: any, @Param("id") id: string) {
    return { data: await this.manuals.requestAccess(user, id) };
  }

  @Post(":id/share-email")
  async shareEmail(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: ShareManualEmailDto) {
    return { data: await this.manuals.shareEmail(user, id, dto) };
  }

  @Post(":id/share-links")
  async createShareLink(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: CreateShareLinkDto) {
    return { data: await this.manuals.createShareLink(user, id, dto) };
  }

  @Get(":id/offline-pack")
  async offlinePack(@CurrentUser() user: any, @Param("id") id: string, @Res() res: Response) {
    const pack = await this.manuals.offlinePack(user, id);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${pack.fileName}"`);
    res.send(pack.html);
  }

  @Get(":id/pdf")
  async pdf(@CurrentUser() user: any, @Param("id") id: string, @Res() res: Response) {
    const pdf = await this.manuals.pdfExport(user, id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdf.fileName}"`);
    res.send(pdf.buffer);
  }

  @Get(":id/collaborators")
  async collaborators(@CurrentUser() user: any, @Param("id") id: string) {
    return { data: await this.manuals.collaborators(user, id) };
  }
}
