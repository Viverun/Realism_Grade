import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { AppConfig } from '../../src/config/schema.js';
import { parseConfig } from '../../src/config/load.js';
import { TIMEFRAME_MS, type Timeframe } from '../../src/core/timeframe.js';
import type { Candle } from '../../src/core/types.js';

const CONFIG_PATH = new URL('../../config/v1.yaml', import.meta.url).pathname;

/** The real config/v1.yaml, optionally mutated, re-validated through the schema. */
export function testConfig(mutate: (raw: any) => void = () => undefined): AppConfig {
  const raw = parse(readFileSync(CONFIG_PATH, 'utf8'));
  mutate(raw);
  return parseConfig(raw);
}

/** Small indicator periods so fixtures stay short. */
export function smallConfig(mutate: (raw: any) => void = () => undefined): AppConfig {
  return testConfig((raw) => {
    raw.indicators = { emaFast: 5, emaSlow: 10, rsiPeriod: 3, warmupCandles: 10 };
    mutate(raw);
  });
}

export const BASE_TIME = Date.parse('2026-09-21T04:00:00Z'); // Monday 08:00 Dubai

export function candle(i: number, o: number, h: number, l: number, c: number, tf: Timeframe = 'H1', base = BASE_TIME): Candle {
  return { timeframe: tf, openTime: base + i * TIMEFRAME_MS[tf], open: o, high: h, low: l, close: c };
}
