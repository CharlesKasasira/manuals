import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/current-user.decorator";
import { Roles } from "../common/roles.decorator";
import { AddTeamMemberDto, CreateApiKeyDto, CreatePermissionDto, CreateTeamDto, CreateUserDto, MailSettingsDto, SendTestEmailDto, UpdateTeamDto, UpdateUserDto } from "./admin.dto";
import { AdminService } from "./admin.service";

@Roles(Role.admin)
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  overview() {
    return this.wrap(this.admin.overview());
  }

  @Get("roles")
  roles() {
    return { data: { roles: Object.values(Role), permissionActions: ["read", "contribute", "review", "publish", "administer"] } };
  }

  @Get("users")
  users() {
    return this.wrap(this.admin.users());
  }

  @Post("users")
  createUser(@CurrentUser() actor: any, @Body() dto: CreateUserDto) {
    return this.wrap(this.admin.createUser(actor.id, dto));
  }

  @Patch("users/:id")
  updateUser(@CurrentUser() actor: any, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.wrap(this.admin.updateUser(actor.id, id, dto));
  }

  @Post("users/:id/deactivate")
  deactivateUser(@CurrentUser() actor: any, @Param("id") id: string) {
    return this.wrap(this.admin.deactivateUser(actor.id, id));
  }

  @Post("users/:id/activate")
  activateUser(@CurrentUser() actor: any, @Param("id") id: string) {
    return this.wrap(this.admin.activateUser(actor.id, id));
  }

  @Post("users/:id/impersonate")
  impersonateUser(@CurrentUser() actor: any, @Param("id") id: string) {
    return this.wrap(this.admin.impersonateUser(actor.id, id));
  }

  @Delete("users/:id")
  deleteUser(@CurrentUser() actor: any, @Param("id") id: string) {
    return this.wrap(this.admin.deleteUser(actor.id, id));
  }

  @Get("teams")
  teams() {
    return this.wrap(this.admin.teams());
  }

  @Post("teams")
  createTeam(@CurrentUser() actor: any, @Body() dto: CreateTeamDto) {
    return this.wrap(this.admin.createTeam(actor.id, dto));
  }

  @Patch("teams/:id")
  updateTeam(@CurrentUser() actor: any, @Param("id") id: string, @Body() dto: UpdateTeamDto) {
    return this.wrap(this.admin.updateTeam(actor.id, id, dto));
  }

  @Delete("teams/:id")
  deleteTeam(@CurrentUser() actor: any, @Param("id") id: string) {
    return this.wrap(this.admin.deleteTeam(actor.id, id));
  }

  @Post("teams/:id/members")
  addTeamMember(@CurrentUser() actor: any, @Param("id") id: string, @Body() dto: AddTeamMemberDto) {
    return this.wrap(this.admin.addTeamMember(actor.id, id, dto));
  }

  @Delete("teams/:id/members/:userId")
  removeTeamMember(@CurrentUser() actor: any, @Param("id") id: string, @Param("userId") userId: string) {
    return this.wrap(this.admin.removeTeamMember(actor.id, id, userId));
  }

  @Get("permissions")
  permissions() {
    return this.wrap(this.admin.permissions());
  }

  @Post("permissions")
  createPermission(@CurrentUser() actor: any, @Body() dto: CreatePermissionDto) {
    return this.wrap(this.admin.createPermission(actor.id, dto));
  }

  @Delete("permissions/:id")
  deletePermission(@CurrentUser() actor: any, @Param("id") id: string) {
    return this.wrap(this.admin.deletePermission(actor.id, id));
  }

  @Get("api-access")
  apiAccess() {
    return this.wrap(this.admin.apiAccess());
  }

  @Post("api-access/enable")
  enableApiAccess(@CurrentUser() actor: any) {
    return this.wrap(this.admin.setApiAccess(actor.id, true));
  }

  @Post("api-access/disable")
  disableApiAccess(@CurrentUser() actor: any) {
    return this.wrap(this.admin.setApiAccess(actor.id, false));
  }

  @Post("api-keys")
  createApiKey(@CurrentUser() actor: any, @Body() dto: CreateApiKeyDto) {
    return this.wrap(this.admin.createApiKey(actor.id, dto));
  }

  @Post("api-keys/:id/revoke")
  revokeApiKey(@CurrentUser() actor: any, @Param("id") id: string) {
    return this.wrap(this.admin.revokeApiKey(actor.id, id));
  }

  @Post("api-keys/:id/activate")
  activateApiKey(@CurrentUser() actor: any, @Param("id") id: string) {
    return this.wrap(this.admin.activateApiKey(actor.id, id));
  }

  @Get("mail")
  mailSettings() {
    return this.wrap(this.admin.mailSettings());
  }

  @Patch("mail")
  updateMailSettings(@CurrentUser() actor: any, @Body() dto: MailSettingsDto) {
    return this.wrap(this.admin.updateMailSettings(actor.id, dto));
  }

  @Post("mail/test")
  sendTestEmail(@CurrentUser() actor: any, @Body() dto: SendTestEmailDto) {
    return this.wrap(this.admin.sendTestEmail(actor.id, dto));
  }

  async wrap<T>(promise: Promise<T>) {
    return { data: await promise };
  }
}
