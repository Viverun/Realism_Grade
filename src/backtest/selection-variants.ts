import { parseConfig } from '../config/load.js';
import type { AppConfig } from '../config/schema.js';

/**
 * The pre-declared V1.1 design grid (docs/v1/selection-v1_1.md §5): 3 windows × 2 immediate
 * thresholds × 2 timeframe sets = 12 configurations, all with selection.mode = daily_top3.
 */
const WINDOWS: Record<string, AppConfig['selection']['slots']> = {
  w08_23: [
    { start: '08:00', end: '13:00' },
    { start: '13:00', end: '18:00' },
    { start: '18:00', end: '23:00' },
  ],
  w04_23: [
    { start: '04:00', end: '10:15' },
    { start: '10:15', end: '16:30' },
    { start: '16:30', end: '23:00' },
  ],
  w00_24: [
    { start: '00:00', end: '08:00' },
    { start: '08:00', end: '16:00' },
    { start: '16:00', end: '24:00' },
  ],
};
const TF_SETS: Record<string, AppConfig['selection']['timeframes']> = {
  all4: ['M5', 'M15', 'M30', 'H1'],
  no5: ['M15', 'M30', 'H1'],
};

export interface SelectionVariant {
  name: string;
  config: AppConfig;
}

export function selectionGrid(base: AppConfig): SelectionVariant[] {
  const out: SelectionVariant[] = [];
  for (const [w, slots] of Object.entries(WINDOWS)) {
    for (const imm of [4, 3]) {
      for (const [t, timeframes] of Object.entries(TF_SETS)) {
        const c = structuredClone(base);
        c.selection = { ...c.selection, mode: 'daily_top3', slots, immediateMinScore: imm, timeframes };
        out.push({ name: `${w}-imm${imm}-${t}`, config: parseConfig(c) });
      }
    }
  }
  return out;
}

/** D10: Ahmad's full setup only — all four rules, all timeframes, no fallback, ≤ 1 alert per slot (≤ 3/day). */
export function fullSetupOnly(base: AppConfig): SelectionVariant {
  const c = structuredClone(base);
  c.selection = { ...c.selection, mode: 'daily_top3', slots: WINDOWS.w08_23!, immediateMinScore: 4, timeframes: ['M5', 'M15', 'M30', 'H1'], fallback: false };
  return { name: 'full_setup_only', config: parseConfig(c) };
}

export function selectionVariant(base: AppConfig, name: string): SelectionVariant {
  if (name === 'full_setup_only') return fullSetupOnly(base);
  const v = selectionGrid(base).find((x) => x.name === name);
  if (!v) throw new Error(`Unknown selection variant ${name}`);
  return v;
}
