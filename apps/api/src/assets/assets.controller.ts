import { Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CurrentUser } from "../common/current-user.decorator";
import { Public } from "../common/public.decorator";
import { AssetsService } from "./assets.service";

@Controller("assets")
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  async list(@CurrentUser() user: any) {
    return { data: await this.assets.list(user) };
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        const dir = join(process.cwd(), "uploads");
        mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-")}`)
    })
  }))
  async upload(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File, @Query("visibility") visibility?: any) {
    return { data: await this.assets.upload(user, file, visibility) };
  }

  @Public()
  @Get(":id/download")
  async download(@CurrentUser() user: any, @Param("id") id: string, @Res() res: any) {
    const file = await this.assets.download(user, id);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    file.stream.pipe(res);
  }

  @Get(":id/usages")
  async usages(@CurrentUser() user: any, @Param("id") id: string) {
    return { data: await this.assets.usages(user, id) };
  }

  @Delete(":id")
  async remove(@CurrentUser() user: any, @Param("id") id: string) {
    return { data: await this.assets.remove(user, id) };
  }
}
