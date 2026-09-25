import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { assertSendable, LIVE_ALERTS_ENABLED, LiveAlertsDisabledError, renderSignalEmail } from '../../src/alerts/email.js';
import { ConsoleTransport, EmailConfigError, FileTransport, ResendTransport, SmtpTransport, transportFromEnv } from '../../src/alerts/email-transport.js';
import { syntheticSignal } from '../../src/alerts/synthetic.js';
import { testConfig } from '../helpers/fixtures.js';
import { useTempDirs } from '../helpers/tmp.js';

const tempDir = useTempDirs();
const config = testConfig();
const { decision, plan } = syntheticSignal(config);
const synthetic = renderSignalEmail(decision, plan, config, 'synthetic');

describe('signal email', () => {
  it('uses the PDF lot-size fixture: $1,000 at 1%, 20-pip stop → 0.05 lots', () => {
    expect(plan.sizing.lots).toBe(0.05);
    expect(plan.sizing.plannedRiskUsd).toBe(10);
  });

  it('contains everything the trader needs (context-V1 §13, spec §7–§9)', () => {
    const t = synthetic.text;
    for (const s of [
      'Pair:            EUR/USD',
      'Direction:       BUY LIMIT',
      'Entry price:     1.08600',
      'Volume:          0.05 lots',
      'Recommended stop — set manually: 1.08400',
      'Timeframe:       1H',
      'Signal time:     2026-09-28 14:00 Dubai',
      'Valid until:     2026-09-28 15:00 Dubai',
      '50 EMA > 200 EMA       ✓',
      'BUY setup confirmed',
      'Planned risk: $10.00 (1.00% of $1000)',
      'The actual loss can be larger',
      'If price is already below the entry when you place the order, skip this signal.',
      `Signal ID: ${decision.id}`,
    ]) {
      expect(t).toContain(s);
    }
  });

  it('marks synthetic emails as tests in the subject and body', () => {
    expect(synthetic.subject).toBe('[TEST — SYNTHETIC SIGNAL, DO NOT TRADE] EUR/USD Entry Signal — BUY LIMIT');
    expect(synthetic.text.startsWith('*** TEST EMAIL — SYNTHETIC SIGNAL ***')).toBe(true);
    expect(decision.id).toContain('SYNTHETIC');
  });

  it('uses the spec subject for live-format messages', () => {
    expect(renderSignalEmail(decision, plan, config, 'live').subject).toBe('EUR/USD Entry Signal — BUY LIMIT');
  });
});

describe('live alerts are disabled', () => {
  const live = renderSignalEmail(decision, plan, config, 'live');

  it('blocks live messages in every transport', async () => {
    expect(LIVE_ALERTS_ENABLED).toBe(false);
    expect(() => assertSendable(live)).toThrow(LiveAlertsDisabledError);
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response('{}');
    }) as unknown as typeof fetch;
    const transports = [
      new ConsoleTransport(undefined, undefined, () => (called = true)),
      new FileTransport(await tempDir(), 'a@x', ['b@x']),
      new ResendTransport('k', 'a@x', ['b@x'], fetchImpl),
      new SmtpTransport({ host: 'localhost', port: 1, secure: false }, 'a@x', ['b@x']),
    ];
    for (const t of transports) await expect(t.send(live)).rejects.toThrow(LiveAlertsDisabledError);
    expect(called).toBe(false);
  });
});

describe('transports', () => {
  it('console prints the message', async () => {
    let out = '';
    await new ConsoleTransport('a@x', ['b@x'], (s) => (out += s)).send(synthetic);
    expect(out).toContain('Subject: [TEST');
    expect(out).toContain('To: b@x');
  });

  it('file writes a UTF-8 .eml', async () => {
    const dir = await tempDir();
    const r = await new FileTransport(dir, 'alerts@example.com', ['t@example.com']).send(synthetic);
    const eml = await readFile(r.id!, 'utf8');
    expect(eml).toContain('To: t@example.com');
    expect(eml).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(eml).toContain('Recommended stop — set manually');
  });

  it('resend posts the message with an idempotency key and never echoes the key', async () => {
    const calls: RequestInit[] = [];
    const ok = (async (_u: string, init: RequestInit) => (calls.push(init), new Response(JSON.stringify({ id: 'msg_1' })))) as unknown as typeof fetch;
    const r = await new ResendTransport('re_secret', 'a@x', ['b@x', 'c@x'], ok).send(synthetic);
    expect(r.id).toBe('msg_1');
    const headers = calls[0]!.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_secret');
    expect(headers['idempotency-key']).toBe(decision.id);
    expect(JSON.parse(calls[0]!.body as string)).toMatchObject({ from: 'a@x', to: ['b@x', 'c@x'], subject: synthetic.subject });
    const bad = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    const error = await new ResendTransport('re_secret', 'a@x', ['b@x'], bad).send(synthetic).catch((e: unknown) => e as Error);
    expect((error as Error).message).toContain('401');
    expect((error as Error).message).not.toContain('re_secret');
  });
});

describe('transportFromEnv', () => {
  it('defaults to console', () => {
    expect(transportFromEnv({}).provider).toBe('console');
  });

  it('builds each provider from environment variables', () => {
    const base = { EMAIL_FROM: 'a@x', EMAIL_TO: 'b@x, c@x' };
    expect(transportFromEnv({ ...base, EMAIL_PROVIDER: 'file' }).provider).toBe('file');
    expect(transportFromEnv({ ...base, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' }).provider).toBe('resend');
    expect(transportFromEnv({ ...base, EMAIL_PROVIDER: 'SMTP', SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u', SMTP_PASS: 'p' }).provider).toBe('smtp');
  });

  it('rejects missing or invalid settings by name only', () => {
    expect(() => transportFromEnv({ EMAIL_PROVIDER: 'smtp', EMAIL_TO: 'b@x' })).toThrow(/EMAIL_FROM/);
    expect(() => transportFromEnv({ EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'a@x' })).toThrow(/EMAIL_TO/);
    expect(() => transportFromEnv({ EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'a@x', EMAIL_TO: 'b@x' })).toThrow(/RESEND_API_KEY/);
    expect(() => transportFromEnv({ EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'a@x', EMAIL_TO: 'b@x' })).toThrow(/SMTP_HOST/);
    expect(() => transportFromEnv({ EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'a@x', EMAIL_TO: 'b@x', SMTP_HOST: 'h', SMTP_USER: 'u' })).toThrow(/SMTP_PASS/);
    expect(() => transportFromEnv({ EMAIL_PROVIDER: 'carrier-pigeon' })).toThrow(EmailConfigError);
  });
});
