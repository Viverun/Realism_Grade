import type { AppConfig } from '../config/schema.js';
import { pipsToPoints } from '../core/price.js';
import type { Timeframe } from '../core/timeframe.js';

/** Strategy parameters for one timeframe, with pip distances converted to integer points. */
export interface StrategyParams {
  timeframe: Timeframe;
  digits: number;
  pointsPerPip: number;
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
  warmupCandles: number;
  pullbackLookback: number;
  swingLookback: number;
  touchTolPoints: number;
  minSwingPoints: number;
  minRangePoints: number;
  entryOffsetPoints: number;
  slBufferPoints: number;
  minSlPips: number;
  rsi: AppConfig['strategy']['rsi'];
  pin: AppConfig['strategy']['pin'];
  entryMode: AppConfig['entry']['mode'];
}

export function resolveParams(config: AppConfig, timeframe: Timeframe): StrategyParams {
  const { pointsPerPip, digits } = config.instrument;
  const tf = config.strategy.timeframes[timeframe];
  const points = (pips: number): number => pipsToPoints(pips, pointsPerPip);
  return {
    timeframe,
    digits,
    pointsPerPip,
    emaFast: config.indicators.emaFast,
    emaSlow: config.indicators.emaSlow,
    rsiPeriod: config.indicators.rsiPeriod,
    warmupCandles: config.indicators.warmupCandles,
    pullbackLookback: config.strategy.pullbackLookback,
    swingLookback: config.strategy.swingLookback,
    touchTolPoints: points(tf.touchTolPips),
    minSwingPoints: points(tf.minSwingPips),
    minRangePoints: points(tf.minRangePips),
    entryOffsetPoints: points(tf.entryOffsetPips),
    slBufferPoints: points(tf.slBufferPips),
    minSlPips: config.sizing.minSlPips,
    rsi: config.strategy.rsi,
    pin: config.strategy.pin,
    entryMode: config.entry.mode,
  };
}
