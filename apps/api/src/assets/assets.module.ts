import { Module } from "@nestjs/common";
import { ManualsModule } from "../manuals/manuals.module";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";

@Module({
  imports: [ManualsModule],
  controllers: [AssetsController],
  providers: [AssetsService]
})
export class AssetsModule {}
