import { ManualStatus, Visibility } from "@prisma/client";
import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class ListManualsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  space?: string;

  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @IsOptional()
  @IsEnum(ManualStatus)
  status?: ManualStatus;

  @IsOptional()
  @IsString()
  tag?: string;
}

export class CreateManualDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  spaceId!: string;

  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @IsOptional()
  @IsArray()
  tagNames?: string[];
}

export class UpdateManualDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  spaceId?: string;

  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @IsOptional()
  @IsArray()
  tagNames?: string[];
}

export class CreatePageDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  sortOrder?: number;

  @IsOptional()
  contentJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  contentHtml?: string;

  @IsOptional()
  @IsString()
  markdown?: string;
}

export class UpdatePageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  sortOrder?: number;

  @IsOptional()
  contentJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  contentHtml?: string;

  @IsOptional()
  @IsString()
  markdown?: string;
}

export class ReorderPagesDto {
  @IsArray()
  pages!: Array<{ id: string; parentId?: string | null; sortOrder: number }>;
}

export class FeedbackDto {
  @IsOptional()
  isHelpful?: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class ReviewCommentDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ShareManualEmailDto {
  @IsEmail()
  recipientEmail!: string;

  @IsOptional()
  @IsString()
  message?: string;
}
