import { Module } from "@nestjs/common";
import { ManualsModule } from "../manuals/manuals.module";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  imports: [ManualsModule],
  controllers: [SearchController],
  providers: [SearchService]
})
export class SearchModule {}
