import { Controller, Get, Param, Query } from "@nestjs/common";
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
}
