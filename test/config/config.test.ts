import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { configHash, ConfigError, loadConfig, parseConfig } from '../../src/config/load.js';

const CONFIG_PATH = new URL('../../config/v1.yaml', import.meta.url).pathname;

async function rawConfig(): Promise<Record<string, any>> {
  return parse(await readFile(CONFIG_PATH, 'utf8'));
}

describe('config/v1.yaml', () => {
  it('loads and carries the approved V1 values', async () => {
    const config = await loadConfig(CONFIG_PATH);
    expect(config.indicators).toMatchObject({ emaFast: 50, emaSlow: 200, rsiPeriod: 14 });
    expect(config.strategy.rsi.oversold).toBe(35);
    expect(config.account).toMatchObject({ currency: 'USD', type: 'standard', riskPercent: 1, pipValuePerLot: 10 });
    expect(config.alerts).toMatchObject({ timezone: 'Asia/Dubai', windowStart: '08:00', windowEnd: '23:00', maxPerDay: 3, cooldownCandles: 3 });
    expect(config.strategy.timeframes.H1.touchTolPips).toBe(5);
  });

  it('rejects risk above the PDF 2% maximum', async () => {
    const raw = await rawConfig();
    raw.account.riskPercent = 2.5;
    expect(() => parseConfig(raw)).toThrow(ConfigError);
    raw.account.riskPercent = 1;
    raw.account.maxRiskPercent = 3;
    expect(() => parseConfig(raw)).toThrow(/may not exceed 2%/);
  });

  it('rejects unknown keys (typos) and missing timeframes', async () => {
    const raw = await rawConfig();
    raw.strategy.rsi.oversoldd = 30;
    expect(() => parseConfig(raw)).toThrow(/Unrecognized key/);
    const raw2 = await rawConfig();
    delete raw2.strategy.timeframes.M30;
    expect(() => parseConfig(raw2)).toThrow(/M30/);
  });

  it('rejects an invalid time zone and inverted trading window', async () => {
    const raw = await rawConfig();
    raw.alerts.timezone = 'Mars/Olympus';
    expect(() => parseConfig(raw)).toThrow(/time zone/);
    const raw2 = await rawConfig();
    raw2.alerts.windowStart = '23:00';
    raw2.alerts.windowEnd = '08:00';
    expect(() => parseConfig(raw2)).toThrow(/windowStart/);
  });

  it('produces a stable hash that changes with any parameter', async () => {
    const a = parseConfig(await rawConfig());
    const b = parseConfig(await rawConfig());
    expect(configHash(a)).toBe(configHash(b));
    expect(configHash(a)).toMatch(/^sha256:[0-9a-f]{64}$/);
    const raw = await rawConfig();
    raw.strategy.rsi.oversold = 30; // PDF baseline variant
    expect(configHash(parseConfig(raw))).not.toBe(configHash(a));
  });
});
