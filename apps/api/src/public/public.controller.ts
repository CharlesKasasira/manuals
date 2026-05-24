import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../common/public.decorator";
import { ListManualsDto } from "../manuals/manuals.dto";
import { ManualsService } from "../manuals/manuals.service";

@Public()
@Controller("public")
export class PublicController {
  constructor(private readonly manuals: ManualsService) {}

  @Get("manuals")
  async manualsList(@Query() query: ListManualsDto) {
    return { data: await this.manuals.publicList(query) };
  }

  @Get("manuals/:slug")
  async manual(@Param("slug") slug: string) {
    return { data: await this.manuals.getBySlug(null, slug) };
  }

  @Get("share/:token")
  async sharedManual(@Param("token") token: string) {
    return { data: await this.manuals.getByShareToken(token) };
  }

  @Get("share/:token/offline-pack")
  async sharedOfflinePack(@Param("token") token: string, @Res() res: Response) {
    const pack = await this.manuals.offlinePack(null, "__shared__", token);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${pack.fileName}"`);
    res.send(pack.html);
  }
}
