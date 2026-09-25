import { describe, expect, it } from 'vitest';
import { configHash } from '../../src/config/load.js';
import { buildSeries, evaluateIndex, makeEngineContext, type Decision } from '../../src/strategy/engine.js';
import { candidatePlan, scoreDecision } from '../../src/strategy/score.js';
import { smallConfig } from '../helpers/fixtures.js';
import { trendingCandles } from '../helpers/series.js';

const d = (trend: boolean, pullback: boolean, rsi: boolean, candle: boolean): Decision =>
  ({ trend, pullback: { ok: pullback }, rsiCheck: { ok: rsi }, candle: { ok: candle } }) as Decision;

describe('scoreDecision', () => {
  it('counts the four V1 rules and assigns tiers', () => {
    expect(scoreDecision(d(true, true, true, true))).toEqual({ score: 4, tier: 'A', failed: [], counterTrend: false });
    expect(scoreDecision(d(true, true, true, false))).toMatchObject({ score: 3, tier: 'B', failed: ['candle'] });
    expect(scoreDecision(d(false, true, true, false))).toMatchObject({ score: 2, tier: 'C', counterTrend: true });
    expect(scoreDecision(d(false, false, false, false))).toMatchObject({ score: 0, tier: 'D' });
  });
});

describe('candidatePlan', () => {
  const config = smallConfig();
  const ctx = makeEngineContext(config, 'M15', configHash(config));
  const series = buildSeries(trendingCandles(300, 11), ctx);

  it('is null during warm-up and valid (entry above stop) afterwards', () => {
    expect(candidatePlan(series, 3, evaluateIndex(series, 3, ctx), ctx)).toBeNull();
    let plans = 0;
    for (let i = 20; i < 300; i++) {
      const plan = candidatePlan(series, i, evaluateIndex(series, i, ctx), ctx);
      if (plan) {
        plans += 1;
        expect(plan.entry).toBeGreaterThan(plan.refSl);
        expect(plan.sizing.plannedRiskPct).toBeLessThanOrEqual(config.account.maxRiskPercent);
      }
    }
    expect(plans).toBeGreaterThan(100);
  });

  it('matches the engine plan for full V1 signals', () => {
    for (let i = 20; i < 300; i++) {
      const decision = evaluateIndex(series, i, ctx);
      if (decision.status === 'signal') expect(candidatePlan(series, i, decision, ctx)).toBe(decision.plan);
    }
  });
});
