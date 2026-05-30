import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../common/public.decorator";
import { ListManualsDto } from "../manuals/manuals.dto";
import { ManualsService } from "../manuals/manuals.service";
import { PrismaService } from "../prisma/prisma.service";

@Public()
@Controller("public")
export class PublicController {
  constructor(private readonly manuals: ManualsService, private readonly prisma: PrismaService) {}

  @Get("manuals")
  async manualsList(@Query() query: ListManualsDto) {
    return { data: await this.manuals.publicList(query) };
  }

  @Get("analytics-settings")
  async analyticsSettings() {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: "analytics.providers" } });
    const value = row?.value && typeof row.value === "object" ? row.value as Record<string, unknown> : {};
    const measurementId = typeof value.googleAnalyticsMeasurementId === "string" ? value.googleAnalyticsMeasurementId : "";
    const containerId = typeof value.googleTagManagerContainerId === "string" ? value.googleTagManagerContainerId : "";
    return {
      data: {
        googleAnalyticsMeasurementId: value.googleAnalyticsEnabled === true && /^G-[A-Z0-9]+$/i.test(measurementId) ? measurementId : "",
        googleTagManagerContainerId: value.googleTagManagerEnabled === true && /^GTM-[A-Z0-9]+$/i.test(containerId) ? containerId : ""
      }
    };
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

  @Get("share/:token/pdf")
  async sharedPdf(@Param("token") token: string, @Res() res: Response) {
    const pdf = await this.manuals.pdfExport(null, "__shared__", token);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdf.fileName}"`);
    res.send(pdf.buffer);
  }
}
