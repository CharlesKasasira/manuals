import { Body, Controller, Get, Param, Post, Query, Redirect, Req, Res } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Request, Response } from "express";
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

  @Public()
  @Get("sso/providers")
  async ssoProviders() {
    return { data: await this.auth.ssoProviders() };
  }

  @Public()
  @Get("sso/:provider/start")
  @Redirect()
  async ssoStart(@Param("provider") provider: string, @Query("next") next = "/app") {
    return { url: (await this.auth.ssoStart(provider, next)).url };
  }

  @Public()
  @Get("sso/:provider/callback")
  async ssoCallback(@Param("provider") provider: string, @Query("code") code: string, @Query("state") state: string, @Req() request: Request, @Res() res: Response) {
    const result = await this.auth.ssoCallback(provider, code, state, request.ip);
    const redirect = new URL(this.auth.loginRedirectUrl());
    redirect.searchParams.set("ssoToken", result.token);
    redirect.searchParams.set("next", result.next);
    res.redirect(redirect.toString());
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
