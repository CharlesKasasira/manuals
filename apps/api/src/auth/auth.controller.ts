import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Request } from "express";
import { CurrentUser } from "../common/current-user.decorator";
import { Public } from "../common/public.decorator";
import { Roles } from "../common/roles.decorator";
import { LoginDto, RegisterDto, RequestPasswordResetDto, ResetPasswordDto } from "./auth.dto";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  async login(@Body() dto: LoginDto, @Req() request: Request) {
    return { data: await this.auth.login(dto, request.ip) };
  }

  @Post("logout")
  async logout(@CurrentUser() user: { id: string } | null, @Req() request: Request) {
    return { data: await this.auth.logout(user?.id, request.ip) };
  }

  @Get("me")
  async me(@CurrentUser() user: unknown) {
    return { data: user };
  }

  @Public()
  @Post("password-reset/request")
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto, @Req() request: Request) {
    return { data: await this.auth.requestPasswordReset(dto, request.ip) };
  }

  @Public()
  @Post("password-reset/complete")
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request) {
    return { data: await this.auth.resetPassword(dto, request.ip) };
  }

  @Roles(Role.admin)
  @Post("register")
  async register(@CurrentUser() user: { id: string }, @Body() dto: RegisterDto) {
    return { data: await this.auth.register(user.id, dto) };
  }
}
