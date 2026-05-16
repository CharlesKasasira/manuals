import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { Public } from "../common/public.decorator";
import { SearchService } from "./search.service";

@Public()
@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@CurrentUser() user: any, @Query() query: any) {
    return { data: await this.searchService.search(user, query) };
  }
}
