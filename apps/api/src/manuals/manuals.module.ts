import { Module } from "@nestjs/common";
import { ManualsController } from "./manuals.controller";
import { PagesController } from "./pages.controller";
import { ManualsService } from "./manuals.service";

@Module({
  controllers: [ManualsController, PagesController],
  providers: [ManualsService],
  exports: [ManualsService]
})
export class ManualsModule {}
