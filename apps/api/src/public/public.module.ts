import { Module } from "@nestjs/common";
import { ManualsModule } from "../manuals/manuals.module";
import { PublicController } from "./public.controller";

@Module({
  imports: [ManualsModule],
  controllers: [PublicController]
})
export class PublicModule {}
