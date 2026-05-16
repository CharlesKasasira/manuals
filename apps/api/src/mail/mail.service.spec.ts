import { BadRequestException } from "@nestjs/common";
import { MailService } from "./mail.service";

describe("MailService", () => {
  function makeService(settings: Record<string, unknown> | null = null) {
    const prisma = {
      systemSetting: {
        findUnique: jest.fn().mockResolvedValue(settings ? { value: settings } : null),
        upsert: jest.fn()
      }
    };
    const config = { get: jest.fn() };
    return { service: new MailService(prisma as any, config as any), prisma };
  }

  it("rejects an email address used as the SMTP host", async () => {
    const { service, prisma } = makeService();

    await expect(service.saveSettings({
      enabled: true,
      senderName: "Manuals",
      senderEmail: "notifications@renu.ac.ug",
      host: "notifications@renu.ac.ug",
      port: 587,
      secure: false,
      verifySsl: true
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it("rejects URL-shaped SMTP hosts", async () => {
    const { service, prisma } = makeService();

    await expect(service.saveSettings({
      enabled: true,
      senderName: "Manuals",
      senderEmail: "notifications@renu.ac.ug",
      host: "https://webmail.renu.ac.ug",
      port: 587,
      secure: false,
      verifySsl: true
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });
});
