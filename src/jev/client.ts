/**
 * Jev judge (docs/v1/jev-research-spec.md §3). Jev only answers the fixed battery about a
 * code-built snapshot; it never decides, sizes or trades. The real client talks to TypeSafe
 * System One (`POST {base}/v1/systemone`, Bearer auth, wire format per the typesafe_sdk 0.7.1
 * OpenAPI models). The API key is read from the environment only (JEV_API_KEY, or the SDK's
 * TYPESAFE_API_KEY) and is never logged.
 */
import type { Question } from './battery.js';

export type Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> };

export interface JudgeResult {
  /** Model that actually answered (may differ from the requested alias). */
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens?: number; output_tokens?: number } | null;
  latencyMs: number;
}

export interface JevJudge {
  readonly requestedModel: string;
  judge(state: unknown, questions: Readonly<Record<string, Question>>): Promise<JudgeResult>;
}

export class JevApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export interface TypeSafeOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export class TypeSafeJudge implements JevJudge {
  readonly requestedModel: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: TypeSafeOptions = {}) {
    const key = (opts.apiKey ?? process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY ?? '').trim();
    if (!key) throw new JevApiError('No Jev API key: set the JEV_API_KEY environment variable.', null);
    this.apiKey = key;
    this.baseUrl = (opts.baseUrl ?? process.env.TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai').replace(/\/+$/, '');
    this.requestedModel = opts.model ?? 'jev-latest';
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** `GET /v1/models`: checks the key and connectivity; returns names and release dates. */
  async listModels(): Promise<{ name: string; description: string; release_date: string }[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/models`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new JevApiError(`Jev HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`, res.status);
    const json = (await res.json()) as { models?: unknown };
    if (!Array.isArray(json.models)) throw new JevApiError('Jev /v1/models: no models array', null);
    return json.models as { name: string; description: string; release_date: string }[];
  }

  async judge(state: unknown, questions: Readonly<Record<string, Question>>): Promise<JudgeResult> {
    const body = JSON.stringify({ state, model: this.requestedModel, questions });
    let lastError: JevApiError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      const t0 = Date.now();
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}/v1/systemone`, {
          method: 'POST',
          headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        lastError = new JevApiError(`Jev request failed: ${(error as Error).name}`, null);
        continue;
      }
      const latencyMs = Date.now() - t0;
      if (!res.ok) {
        const text = (await res.text()).slice(0, 500);
        lastError = new JevApiError(`Jev HTTP ${res.status}: ${text}`, res.status);
        if (RETRY_STATUSES.has(res.status)) continue;
        throw lastError;
      }
      return parseResponse(await res.json(), questions, latencyMs);
    }
    throw lastError ?? new JevApiError('Jev request failed', null);
  }
}

/** Validates a System One response against the questions asked. */
export function parseResponse(raw: unknown, questions: Readonly<Record<string, Question>>, latencyMs: number): JudgeResult {
  if (typeof raw !== 'object' || raw === null) throw new JevApiError('Jev response is not an object', null);
  const r = raw as { model?: unknown; answers?: unknown; usage?: unknown };
  if (typeof r.model !== 'string') throw new JevApiError('Jev response has no model', null);
  if (typeof r.answers !== 'object' || r.answers === null) throw new JevApiError('Jev response has no answers', null);
  const answers: Record<string, Answer> = {};
  for (const [name, q] of Object.entries(questions)) {
    const a = (r.answers as Record<string, unknown>)[name] as Record<string, unknown> | undefined;
    if (!a || a.type !== q.type) throw new JevApiError(`Jev answer "${name}" missing or of the wrong type`, null);
    if (q.type === 'noul') {
      if (typeof a.noul !== 'number' || !(a.noul >= 0 && a.noul <= 1)) throw new JevApiError(`Jev answer "${name}": bad noul`, null);
      answers[name] = { type: 'noul', noul: a.noul };
    } else {
      if (typeof a.choice !== 'string' || !(a.choice in q.criteria) || typeof a.confidence !== 'number') {
        throw new JevApiError(`Jev answer "${name}": bad choice`, null);
      }
      answers[name] = { type: 'choice', choice: a.choice, confidence: a.confidence, probabilities: (a.probabilities ?? {}) as Record<string, number> };
    }
  }
  return { model: r.model, answers, usage: (r.usage ?? null) as JudgeResult['usage'], latencyMs };
}

/**
 * Deterministic stand-in for tests and dry runs: answers are a hash of the state, so they
 * carry no information. Never used for evidence.
 */
export class FakeJudge implements JevJudge {
  readonly requestedModel = 'fake-jev';
  calls = 0;

  async judge(state: unknown, questions: Readonly<Record<string, Question>>): Promise<JudgeResult> {
    this.calls += 1;
    const text = JSON.stringify(state);
    let h = 2166136261;
    for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 16777619) >>> 0;
    const answers: Record<string, Answer> = {};
    Object.entries(questions).forEach(([name, q], n) => {
      const u = (((h + n * 2654435761) >>> 0) % 10_000) / 10_000;
      if (q.type === 'noul') answers[name] = { type: 'noul', noul: u };
      else {
        const labels = Object.keys(q.criteria);
        const choice = labels[Math.floor(u * labels.length)]!;
        answers[name] = { type: 'choice', choice, confidence: 0.5, probabilities: Object.fromEntries(labels.map((l) => [l, l === choice ? 0.5 : 0.5 / (labels.length - 1)])) };
      }
    });
    return { model: this.requestedModel, answers, usage: null, latencyMs: 0 };
  }
}
