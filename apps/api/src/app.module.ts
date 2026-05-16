import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { AssetsModule } from "./assets/assets.module";
import { GovernanceModule } from "./governance/governance.module";
import { ManualsModule } from "./manuals/manuals.module";
import { MailModule } from "./mail/mail.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PublicModule } from "./public/public.module";
import { SearchModule } from "./search/search.module";
import { CommonModule } from "./common/common.module";
import { SpacesModule } from "./spaces/spaces.module";
import { AdminModule } from "./admin/admin.module";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { RolesGuard } from "./common/roles.guard";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env", "apps/api/.env"]
    }),
    JwtModule.register({ global: true }),
    CommonModule,
    PrismaModule,
    MailModule,
    AuthModule,
    AdminModule,
    SpacesModule,
    ManualsModule,
    AssetsModule,
    SearchModule,
    PublicModule,
    GovernanceModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard }
  ]
})
export class AppModule {}
