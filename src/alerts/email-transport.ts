/**
 * Email delivery. Provider, sender and recipients come only from environment variables:
 *
 *   EMAIL_PROVIDER   console (default) | file | smtp | resend
 *   EMAIL_FROM       sender address (required for smtp/resend)
 *   EMAIL_TO         comma-separated recipients (required for smtp/resend)
 *   EMAIL_OUTBOX_DIR file provider only (default data/outbox)
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE (true for port 465), SMTP_USER, SMTP_PASS
 *   RESEND_API_KEY   resend provider only
 *
 * Secrets are never logged or included in error messages. Every send goes through
 * `assertSendable`, so live alerts stay blocked while they are disabled.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertSendable, type EmailMessage } from './email.js';

export interface SendResult {
  provider: string;
  /** Provider message ID, or the file path for the file provider. */
  id: string | null;
}

export interface EmailTransport {
  readonly provider: string;
  send(message: EmailMessage): Promise<SendResult>;
}

export class EmailConfigError extends Error {}

type Env = Record<string, string | undefined>;

const required = (env: Env, name: string): string => {
  const v = env[name]?.trim();
  if (!v) throw new EmailConfigError(`${name} is not set`);
  return v;
};

const recipients = (env: Env): string[] => {
  const list = required(env, 'EMAIL_TO').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) throw new EmailConfigError('EMAIL_TO has no recipients');
  return list;
};

abstract class Guarded implements EmailTransport {
  abstract readonly provider: string;
  protected abstract deliver(message: EmailMessage): Promise<SendResult>;
  async send(message: EmailMessage): Promise<SendResult> {
    assertSendable(message);
    return this.deliver(message);
  }
}

/** Prints the message; sends nothing. */
export class ConsoleTransport extends Guarded {
  readonly provider = 'console';
  constructor(
    private readonly from = 'alerts@localhost',
    private readonly to: string[] = ['trader@localhost'],
    private readonly write: (s: string) => void = (s) => void process.stdout.write(s),
  ) {
    super();
  }
  protected async deliver(m: EmailMessage): Promise<SendResult> {
    this.write(`From: ${this.from}\nTo: ${this.to.join(', ')}\nSubject: ${m.subject}\n\n${m.text}`);
    return { provider: this.provider, id: null };
  }
}

/** Writes an RFC 5322 .eml file per message (for inspection in a mail client). */
export class FileTransport extends Guarded {
  readonly provider = 'file';
  constructor(
    private readonly dir: string,
    private readonly from: string,
    private readonly to: string[],
  ) {
    super();
  }
  protected async deliver(m: EmailMessage): Promise<SendResult> {
    await mkdir(this.dir, { recursive: true });
    const path = join(this.dir, `${m.signalId.replace(/[^A-Za-z0-9._-]+/g, '_')}.eml`);
    const subject = `=?UTF-8?B?${Buffer.from(m.subject).toString('base64')}?=`;
    const eml = [`From: ${this.from}`, `To: ${this.to.join(', ')}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', m.text].join('\r\n');
    await writeFile(path, eml);
    return { provider: this.provider, id: path };
  }
}

/** Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendTransport extends Guarded {
  readonly provider = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly to: string[],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
  }
  protected async deliver(m: EmailMessage): Promise<SendResult> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json', 'idempotency-key': m.signalId },
      body: JSON.stringify({ from: this.from, to: this.to, subject: m.subject, text: m.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { id?: string };
    return { provider: this.provider, id: json.id ?? null };
  }
}

/** SMTP via nodemailer (e.g. Gmail with an app password). */
export class SmtpTransport extends Guarded {
  readonly provider = 'smtp';
  constructor(
    private readonly options: { host: string; port: number; secure: boolean; user?: string; pass?: string },
    private readonly from: string,
    private readonly to: string[],
  ) {
    super();
  }
  protected async deliver(m: EmailMessage): Promise<SendResult> {
    const { createTransport } = await import('nodemailer');
    const { host, port, secure, user, pass } = this.options;
    const transport = createTransport({ host, port, secure, ...(user ? { auth: { user, pass } } : {}) });
    const info = await transport.sendMail({ from: this.from, to: this.to, subject: m.subject, text: m.text });
    return { provider: this.provider, id: info.messageId ?? null };
  }
}

export function transportFromEnv(env: Env = process.env): EmailTransport {
  const provider = (env.EMAIL_PROVIDER ?? 'console').trim().toLowerCase();
  if (provider === 'console') {
    return new ConsoleTransport(env.EMAIL_FROM?.trim() || undefined, env.EMAIL_TO ? recipients(env) : undefined);
  }
  const from = required(env, 'EMAIL_FROM');
  const to = recipients(env);
  if (provider === 'file') return new FileTransport(env.EMAIL_OUTBOX_DIR?.trim() || 'data/outbox', from, to);
  if (provider === 'resend') return new ResendTransport(required(env, 'RESEND_API_KEY'), from, to);
  if (provider === 'smtp') {
    const port = Number(env.SMTP_PORT ?? 587);
    if (!Number.isInteger(port) || port <= 0) throw new EmailConfigError('SMTP_PORT is not a valid port');
    const user = env.SMTP_USER?.trim();
    const pass = env.SMTP_PASS;
    if (user && !pass) throw new EmailConfigError('SMTP_PASS is not set');
    return new SmtpTransport(
      { host: required(env, 'SMTP_HOST'), port, secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465, ...(user ? { user, pass: pass! } : {}) },
      from,
      to,
    );
  }
  throw new EmailConfigError(`Unknown EMAIL_PROVIDER "${provider}" (console | file | smtp | resend)`);
}
