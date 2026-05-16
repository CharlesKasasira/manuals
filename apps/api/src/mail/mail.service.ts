import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Socket, connect as netConnect } from "net";
import { TLSSocket, connect as tlsConnect } from "tls";
import { PrismaService } from "../prisma/prisma.service";

export type MailSettings = {
  enabled: boolean;
  senderName: string;
  senderEmail: string;
  host: string;
  port: number;
  clientHostname?: string;
  secure: boolean;
  verifySsl: boolean;
  username?: string;
  password?: string;
};

export type PublicMailSettings = Omit<MailSettings, "password"> & {
  hasPassword: boolean;
  configured: boolean;
};

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

@Injectable()
export class MailService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async getSettings(): Promise<PublicMailSettings> {
    const settings = await this.readSettings();
    return this.publicSettings(settings);
  }

  async saveSettings(input: Partial<Omit<MailSettings, "password">> & { password?: string | null }) {
    const current = await this.readSettings();
    const next: MailSettings = {
      enabled: input.enabled ?? current.enabled ?? false,
      senderName: this.clean(input.senderName ?? current.senderName) ?? "Manuals",
      senderEmail: this.clean(input.senderEmail ?? current.senderEmail) ?? "",
      host: this.clean(input.host ?? current.host) ?? "",
      port: Number(input.port ?? current.port ?? 587),
      clientHostname: this.clean(input.clientHostname ?? current.clientHostname),
      secure: input.secure ?? current.secure ?? false,
      verifySsl: input.verifySsl ?? current.verifySsl ?? true,
      username: this.clean(input.username ?? current.username),
      password: input.password === null ? undefined : input.password === undefined || input.password === "" ? current.password : input.password
    };

    this.assertValidSettings(next);
    await this.prisma.systemSetting.upsert({
      where: { key: "mail.smtp" },
      update: { value: next },
      create: { key: "mail.smtp", value: next }
    });
    return this.publicSettings(next);
  }

  async sendTestEmail(to: string) {
    const settings = await this.requireConfiguredSettings();
    await this.sendMail({
      to,
      subject: "Manuals test email",
      text: "This test email confirms that your Manuals SMTP configuration can send mail.",
      html: "<p>This test email confirms that your Manuals SMTP configuration can send mail.</p>"
    }, settings);
    return { ok: true };
  }

  async sendMail(input: SendMailInput, settings?: MailSettings) {
    const config = settings ?? await this.requireConfiguredSettings();
    await this.deliver(config, input);
  }

  appUrl(path = "") {
    const base = this.config.get<string>("WEB_ORIGIN")
      ?? this.config.get<string>("APP_URL")
      ?? this.config.get<string>("PUBLIC_APP_URL")
      ?? "http://localhost:3000";
    return `${base.replace(/\/$/, "")}${path}`;
  }

  async requireConfiguredSettings() {
    const settings = await this.readSettings();
    this.assertValidSettings(settings);
    if (!settings.enabled) throw new BadRequestException("Email sending is disabled.");
    return settings;
  }

  async readSettings(): Promise<MailSettings> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: "mail.smtp" } });
    const value = row?.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        enabled: false,
        senderName: "Manuals",
        senderEmail: "",
        host: "",
        port: 587,
        secure: false,
        verifySsl: true
      };
    }
    const raw = value as Partial<MailSettings>;
    return {
      enabled: Boolean(raw.enabled),
      senderName: this.clean(raw.senderName) || "Manuals",
      senderEmail: this.clean(raw.senderEmail) ?? "",
      host: this.clean(raw.host) ?? "",
      port: Number(raw.port || 587),
      clientHostname: this.clean(raw.clientHostname),
      secure: Boolean(raw.secure),
      verifySsl: raw.verifySsl !== false,
      username: this.clean(raw.username),
      password: typeof raw.password === "string" ? raw.password : undefined
    };
  }

  publicSettings(settings: MailSettings): PublicMailSettings {
    const { password, ...rest } = settings;
    return {
      ...rest,
      hasPassword: Boolean(password),
      configured: Boolean(settings.senderEmail && settings.host && settings.port)
    };
  }

  assertValidSettings(settings: MailSettings) {
    if (!settings.senderEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.senderEmail)) {
      throw new BadRequestException("A valid sender email is required.");
    }
    if (!settings.host) throw new BadRequestException("SMTP host is required.");
    if (settings.host.includes("@")) {
      throw new BadRequestException("SMTP host must be a server hostname, not an email address.");
    }
    if (/^https?:\/\//i.test(settings.host) || settings.host.includes("/")) {
      throw new BadRequestException("SMTP host must not include a protocol or path.");
    }
    if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) {
      throw new BadRequestException("SMTP port must be between 1 and 65535.");
    }
  }

  async deliver(settings: MailSettings, input: SendMailInput) {
    let socket: SmtpSocket | null = null;
    try {
      socket = await this.openSocket(settings);
      await socket.expect(220);
      await this.ehlo(socket, settings);
      if (!settings.secure && settings.port === 587) {
        await socket.command("STARTTLS", 220);
        await socket.upgrade(settings);
        await this.ehlo(socket, settings);
      }
      if (settings.username && settings.password) {
        const token = Buffer.from(`\0${settings.username}\0${settings.password}`).toString("base64");
        await socket.command(`AUTH PLAIN ${token}`, 235);
      }

      await socket.command(`MAIL FROM:<${settings.senderEmail}>`, 250);
      await socket.command(`RCPT TO:<${input.to}>`, [250, 251]);
      await socket.command("DATA", 354);
      await socket.writeData(this.buildMessage(settings, input));
      await socket.expect(250);
      await socket.command("QUIT", 221);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const message = error instanceof Error ? error.message : "SMTP delivery failed.";
      throw new BadRequestException(`SMTP delivery failed: ${message}`);
    } finally {
      socket?.close();
    }
  }

  async ehlo(socket: SmtpSocket, settings: MailSettings) {
    const hostname = settings.clientHostname || this.config.get<string>("SMTP_CLIENT_HOSTNAME", "manuals.local");
    try {
      await socket.command(`EHLO ${hostname}`, 250);
    } catch {
      await socket.command(`HELO ${hostname}`, 250);
    }
  }

  async openSocket(settings: MailSettings) {
    const socket = settings.secure
      ? tlsConnect({ host: settings.host, port: settings.port, servername: settings.host, rejectUnauthorized: settings.verifySsl })
      : netConnect({ host: settings.host, port: settings.port });
    return new SmtpSocket(socket, settings.host);
  }

  buildMessage(settings: MailSettings, input: SendMailInput) {
    const from = settings.senderName
      ? `"${settings.senderName.replace(/"/g, "'")}" <${settings.senderEmail}>`
      : settings.senderEmail;
    const boundary = `manuals-${Date.now().toString(36)}`;
    const headers = [
      `From: ${from}`,
      `To: ${input.to}`,
      `Subject: ${this.encodeHeader(input.subject)}`,
      "MIME-Version: 1.0",
      input.html ? `Content-Type: multipart/alternative; boundary="${boundary}"` : "Content-Type: text/plain; charset=utf-8"
    ];
    if (!input.html) return `${headers.join("\r\n")}\r\n\r\n${input.text}\r\n`;

    return [
      headers.join("\r\n"),
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      input.text,
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      input.html,
      `--${boundary}--`,
      ""
    ].join("\r\n");
  }

  encodeHeader(value: string) {
    return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
  }

  clean(value: unknown) {
    return typeof value === "string" ? value.trim() : undefined;
  }
}

class SmtpSocket {
  private socket: Socket | TLSSocket;
  private buffer = "";
  private waiters: Array<(line: string) => void> = [];

  constructor(socket: Socket | TLSSocket, private readonly host: string) {
    this.socket = socket;
    this.socket.setTimeout(30_000);
    this.socket.on("data", (chunk) => this.receive(chunk.toString("utf8")));
    this.socket.on("error", (error) => this.rejectAll(error));
    this.socket.on("timeout", () => this.rejectAll(new Error("SMTP connection timed out.")));
  }

  async command(command: string, expected: number | number[]) {
    await this.write(`${command}\r\n`);
    return this.expect(expected);
  }

  async writeData(message: string) {
    const escaped = message.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    await this.write(`${escaped}\r\n.\r\n`);
  }

  async expect(expected: number | number[]) {
    const codes = Array.isArray(expected) ? expected : [expected];
    const response = await this.readResponse();
    if (!codes.includes(response.code)) {
      throw new Error(`SMTP server responded with ${response.code}: ${response.message}`);
    }
    return response;
  }

  async upgrade(settings: MailSettings) {
    const tlsSocket = tlsConnect({
      socket: this.socket,
      servername: this.host,
      rejectUnauthorized: settings.verifySsl
    });
    this.socket.removeAllListeners("data");
    this.socket = tlsSocket;
    this.socket.on("data", (chunk) => this.receive(chunk.toString("utf8")));
    this.socket.on("error", (error) => this.rejectAll(error));
    this.socket.on("timeout", () => this.rejectAll(new Error("SMTP connection timed out.")));
    await new Promise<void>((resolve, reject) => {
      tlsSocket.once("secureConnect", resolve);
      tlsSocket.once("error", reject);
    });
  }

  close() {
    this.socket.end();
  }

  private async write(value: string) {
    await new Promise<void>((resolve, reject) => {
      this.socket.write(value, (error) => error ? reject(error) : resolve());
    });
  }

  private async readResponse() {
    const lines: string[] = [];
    while (true) {
      const line = await this.readLine();
      lines.push(line);
      if (/^\d{3}\s/.test(line)) {
        return { code: Number(line.slice(0, 3)), message: lines.join("\n") };
      }
    }
  }

  private async readLine() {
    const existing = this.shiftLine();
    if (existing) return existing;
    return new Promise<string>((resolve) => this.waiters.push(resolve));
  }

  private receive(chunk: string) {
    this.buffer += chunk;
    let line = this.shiftLine();
    while (line && this.waiters.length) {
      const resolve = this.waiters.shift();
      resolve?.(line);
      line = this.shiftLine();
    }
  }

  private shiftLine() {
    const index = this.buffer.indexOf("\n");
    if (index === -1) return null;
    const line = this.buffer.slice(0, index).replace(/\r$/, "");
    this.buffer = this.buffer.slice(index + 1);
    return line;
  }

  private rejectAll(error: Error) {
    while (this.waiters.length) {
      const resolve = this.waiters.shift();
      resolve?.(`500 ${error.message}`);
    }
  }
}
