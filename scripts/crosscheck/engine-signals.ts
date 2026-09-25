/**
 * Prints the engine's V1 signal ids (status = 'signal') for every timeframe, one per line, for
 * comparison with scripts/crosscheck/independent_signals.py. No execution or outcome data.
 *
 *   tsx scripts/crosscheck/engine-signals.ts <files…> --end <ISO> | sort > engine.txt
 */
import { configHash, loadConfig } from '../../src/config/load.js';
import { TIMEFRAMES } from '../../src/core/timeframe.js';
import { TickStore } from '../../src/backtest/tick-store.js';
import { decideAll, makeEngineContext } from '../../src/strategy/engine.js';

const argv = process.argv.slice(2);
const endIso = argv[argv.indexOf('--end') + 1]!;
const files = argv.filter((a) => a.endsWith('.zip') || a.endsWith('.csv')).sort();
const config = await loadConfig('config/v1.yaml');
const endMs = Date.parse(endIso);
const { store } = await TickStore.load(files, config.instrument.digits, { endMs });
const candles = store.buildCandles(endMs);
for (const tf of TIMEFRAMES) {
  for (const d of decideAll(candles[tf], makeEngineContext(config, tf, configHash(config)))) {
    if (d.status === 'signal') process.stdout.write(`${d.id}\n`);
  }
}
