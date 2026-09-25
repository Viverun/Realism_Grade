import { describe, expect, it } from 'vitest';
import { configHash } from '../../src/config/load.js';
import { seededRandom } from '../../src/core/random.js';
import { buildSeries, evaluateIndex, makeEngineContext } from '../../src/strategy/engine.js';
import { candidatePlan, scoreDecision } from '../../src/strategy/score.js';
import { BATTERY, PRIMARY_QUESTION, PROMPT_HASH, renderState } from '../../src/jev/battery.js';
import { FakeJudge, JevApiError, parseResponse, TypeSafeJudge } from '../../src/jev/client.js';
import { fitLogistic, predictLogistic } from '../../src/jev/logistic.js';
import { auc, brierSkillVsBaseRate, evaluate, reliability, tercileSpread, type EvalSample } from '../../src/jev/metrics.js';
import { buildPopulation } from '../../src/jev/population.js';
import { buildSnapshot, featureNames, featureVector, SNAPSHOT_MIN_INDEX, snapshotReady } from '../../src/jev/snapshot.js';
import { smallConfig } from '../helpers/fixtures.js';
import { trendingCandles } from '../helpers/series.js';

const config = smallConfig();
const hash = configHash(config);

function snapshotsAt(candles: ReturnType<typeof trendingCandles>, tf: 'M15' | 'M30' = 'M15') {
  const ctx = makeEngineContext(config, tf, hash);
  const series = buildSeries(candles, ctx);
  const out: { i: number; json: string }[] = [];
  for (let i = SNAPSHOT_MIN_INDEX; i < candles.length; i++) {
    if (!snapshotReady(series, i)) continue;
    const d = evaluateIndex(series, i, ctx);
    const plan = candidatePlan(series, i, d, ctx);
    if (plan) out.push({ i, json: JSON.stringify(buildSnapshot(series, i, d, scoreDecision(d), plan, ctx)) });
  }
  return { ctx, series, out };
}

describe('Jev snapshot', () => {
  const candles = trendingCandles(400, 7);
  const { out } = snapshotsAt(candles);

  it('is a pure function of candles[0..i] (no look-ahead)', () => {
    expect(out.length).toBeGreaterThan(50);
    for (const { i, json } of out.filter((_, k) => k % 7 === 0)) {
      const prefix = snapshotsAt(candles.slice(0, i + 1)).out.find((s) => s.i === i);
      expect(prefix?.json).toBe(json);
    }
  });

  it('contains no timestamps, dates or absolute prices', () => {
    const prices = new Set(candles.flatMap((c) => [c.open, c.high, c.low, c.close]));
    for (const { json } of out) {
      expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}|Time"|date/i);
      const numbers: number[] = [];
      JSON.parse(json, (_k, v) => (typeof v === 'number' && numbers.push(v), v));
      for (const n of numbers) {
        expect(prices.has(n)).toBe(false);
        expect(Math.abs(n)).toBeLessThan(10_000);
      }
    }
  });

  it('has one feature per name', () => {
    const snap = JSON.parse(out[0]!.json);
    expect(featureVector(snap)).toHaveLength(featureNames().length);
    expect(featureVector(snap).every(Number.isFinite)).toBe(true);
  });
});

describe('Jev battery', () => {
  it('has a stable prompt hash and Q1 as a noul', () => {
    expect(PROMPT_HASH).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(BATTERY[PRIMARY_QUESTION]!.type).toBe('noul');
    expect(renderState(JSON.parse(snapshotsAt(trendingCandles(100, 3)).out[0]!.json)).description).toContain('No dates');
  });
});

describe('population', () => {
  it('samples all tiers on M30/H1 and tier A only on M5/M15, in window, sorted', () => {
    const m15 = trendingCandles(600, 5, 'M15');
    const m30 = trendingCandles(600, 6, 'M30');
    const pop = buildPopulation({ M15: m15, M30: m30 }, config, { startMs: 0, endMs: Infinity });
    expect(pop.some((s) => s.decision.timeframe === 'M30' && s.scored.tier !== 'A')).toBe(true);
    for (const s of pop) {
      if (s.decision.timeframe === 'M15') expect(s.scored.tier).toBe('A');
      expect(s.decision.inWindow).toBe(true);
    }
    for (let k = 1; k < pop.length; k++) expect(pop[k]!.decision.closeTime).toBeGreaterThanOrEqual(pop[k - 1]!.decision.closeTime);
  });
});

describe('Jev client', () => {
  const q = { a: BATTERY[PRIMARY_QUESTION]!, b: BATTERY.q4_regime! };
  const good = { model: 'jev-2026-09-15', usage: { input_tokens: 10, output_tokens: 2 }, answers: { a: { type: 'noul', noul: 0.3 }, b: { type: 'choice', choice: 'ranging', confidence: 0.7, probabilities: { trending: 0.2, ranging: 0.7, volatile_choppy: 0.1 } } } };

  it('parses and validates System One responses', () => {
    expect(parseResponse(good, q, 5).answers.a).toEqual({ type: 'noul', noul: 0.3 });
    expect(() => parseResponse({ ...good, answers: { a: { type: 'noul', noul: 1.5 }, b: good.answers.b } }, q, 0)).toThrow(JevApiError);
    expect(() => parseResponse({ ...good, answers: { a: good.answers.a, b: { ...good.answers.b, choice: 'bogus' } } }, q, 0)).toThrow(JevApiError);
    expect(() => parseResponse({ answers: good.answers }, q, 0)).toThrow(/no model/);
  });

  it('sends the documented request with Bearer auth and retries 5xx', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const responses = [new Response('busy', { status: 503 }), new Response(JSON.stringify(good), { status: 200 })];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return responses.shift()!;
    }) as unknown as typeof fetch;
    const judge = new TypeSafeJudge({ apiKey: 'test-key', fetchImpl, maxRetries: 1 });
    const result = await judge.judge({ x: 1 }, q);
    expect(result.model).toBe('jev-2026-09-15');
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe('https://api.typesafe.ai/v1/systemone');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ state: { x: 1 }, model: 'jev-latest', questions: q });
  });

  it('does not retry client errors and never echoes the key', async () => {
    const fetchImpl = (async () => new Response('bad request', { status: 400 })) as unknown as typeof fetch;
    const judge = new TypeSafeJudge({ apiKey: 'secret-123', fetchImpl });
    const error = await judge.judge({}, q).catch((e: unknown) => e as JevApiError);
    expect(error).toBeInstanceOf(JevApiError);
    expect((error as JevApiError).status).toBe(400);
    expect(String((error as Error).message)).not.toContain('secret-123');
  });

  it('requires a key from the environment', () => {
    const saved = [process.env.JEV_API_KEY, process.env.TYPESAFE_API_KEY];
    delete process.env.JEV_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      expect(() => new TypeSafeJudge()).toThrow(/JEV_API_KEY/);
    } finally {
      if (saved[0] !== undefined) process.env.JEV_API_KEY = saved[0];
      if (saved[1] !== undefined) process.env.TYPESAFE_API_KEY = saved[1];
    }
  });

  it('fake judge is deterministic', async () => {
    const a = await new FakeJudge().judge({ s: 1 }, BATTERY);
    const b = await new FakeJudge().judge({ s: 1 }, BATTERY);
    expect(a).toEqual(b);
  });
});

describe('metrics', () => {
  it('AUC handles perfect, reversed and tied scores', () => {
    expect(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
    expect(auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1])).toBe(0);
    expect(auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBe(0.5);
    expect(auc([0.5, 0.5], [1, 1])).toBeNull();
  });

  it('Brier skill, ECE and tercile spread', () => {
    expect(brierSkillVsBaseRate([0.5, 0.5], [0, 1])).toBeCloseTo(0);
    expect(brierSkillVsBaseRate([0, 1], [0, 1])).toBeCloseTo(1);
    expect(reliability([0.25, 0.25, 0.25, 0.25], [0, 0, 0, 1]).ece).toBeCloseTo(0);
    expect(tercileSpread([0.1, 0.2, 0.3, 0.7, 0.8, 0.9], [-1, -1, 2, -1, 2, 2])).toBeCloseTo(3);
  });

  const synthetic = (informative: boolean, days: number, perDay: number): EvalSample[] => {
    const random = seededRandom(42);
    const out: EvalSample[] = [];
    for (let d = 0; d < days; d++) {
      const day = new Date(Date.parse('2026-10-01T00:00:00Z') + d * 86_400_000).toISOString().slice(0, 10);
      for (let k = 0; k < perDay; k++) {
        const truth = 0.15 + 0.4 * random();
        const y = random() < truth ? 1 : 0;
        const p = informative ? truth : 0.15 + 0.4 * random();
        out.push({ day, p, pBaseline: 0.33, y, r: y ? 2 : -1 });
      }
    }
    return out;
  };

  it('verdict: insufficient, pass on informative forecasts, fail on noise', () => {
    expect(evaluate(synthetic(true, 20, 5)).verdict).toBe('INSUFFICIENT_DATA');
    const pass = evaluate(synthetic(true, 95, 17));
    expect(pass.checks.map((c) => c.pass)).toEqual([true, true, true, true, true]);
    expect(pass.verdict).toBe('PASS');
    expect(evaluate(synthetic(false, 95, 17)).verdict).toBe('FAIL');
  }, 60_000);
});

describe('logistic baseline', () => {
  it('recovers the direction of a real effect', () => {
    const random = seededRandom(1);
    const x: number[][] = [];
    const y: number[] = [];
    for (let k = 0; k < 2000; k++) {
      const a = random() * 10;
      const b = random();
      x.push([a, b]);
      y.push(random() < 1 / (1 + Math.exp(-(a - 5))) ? 1 : 0);
    }
    const model = fitLogistic(x, y, { featureNames: ['a', 'b'], trainedOn: { start: '', end: '', samples: 2000, positives: 0 }, snapshotVersion: 't' });
    expect(model.coef[1]).toBeGreaterThan(1);
    expect(Math.abs(model.coef[2]!)).toBeLessThan(0.3);
    expect(predictLogistic(model, [9, 0.5])).toBeGreaterThan(0.9);
    expect(predictLogistic(model, [1, 0.5])).toBeLessThan(0.1);
  });
});
