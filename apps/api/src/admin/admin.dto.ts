import { PermissionAction, Role } from "@prisma/client";
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from "class-validator";

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsString()
  @MinLength(10)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTeamDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AddTeamMemberDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class CreatePermissionDto {
  @IsString()
  manualId!: string;

  @IsEnum(PermissionAction)
  action!: PermissionAction;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class CreateApiKeyDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class MailSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsString()
  senderName!: string;

  @IsEmail()
  senderEmail!: string;

  @IsString()
  @Matches(/^(?!.*@)(?!https?:\/\/)(?!.*\/).+$/i, { message: "SMTP host must be a server hostname, not an email address or URL." })
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsOptional()
  @IsString()
  clientHostname?: string;

  @IsBoolean()
  secure!: boolean;

  @IsBoolean()
  verifySsl!: boolean;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string | null;
}

export class SendTestEmailDto {
  @IsEmail()
  recipientEmail!: string;
}
