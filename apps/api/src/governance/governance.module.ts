import { Module } from "@nestjs/common";
import { ManualsModule } from "../manuals/manuals.module";
import { GovernanceController } from "./governance.controller";

@Module({
  imports: [ManualsModule],
  controllers: [GovernanceController]
})
export class GovernanceModule {}
