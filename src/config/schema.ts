import { z } from 'zod';

const nonNegative = z.number().finite().nonnegative();
const positive = z.number().finite().positive();
const positiveInt = z.number().int().positive();
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');

/** Hard limit from the PDF: never risk more than 2% per trade. */
export const PDF_MAX_RISK_PERCENT = 2;

const timeframeParams = z
  .object({
    touchTolPips: nonNegative,
    minSwingPips: nonNegative,
    minRangePips: nonNegative,
    entryOffsetPips: nonNegative,
    slBufferPips: nonNegative,
    outcomeHorizons: z.array(positiveInt).nonempty(),
  })
  .strict();

export const configSchema = z
  .object({
    version: z.literal(1),
    instrument: z
      .object({
        symbol: z.literal('EURUSD'),
        digits: z.number().int().min(1).max(8),
        pointsPerPip: positiveInt,
      })
      .strict(),
    account: z
      .object({
        currency: z.string().regex(/^[A-Z]{3}$/),
        type: z.enum(['standard', 'cent']),
        balance: positive,
        riskPercent: positive,
        maxRiskPercent: positive.max(PDF_MAX_RISK_PERCENT, `maxRiskPercent may not exceed ${PDF_MAX_RISK_PERCENT}%`),
        pipValuePerLot: positive,
        /** Required, no default: 0 is only correct for spread-only accounts (spec §9, PDF review P5). */
        commissionPerLotRoundTrip: nonNegative,
        lotStep: positive,
        minLot: positive,
        maxLot: positive,
      })
      .strict()
      .refine((a) => a.riskPercent <= a.maxRiskPercent, {
        message: 'riskPercent exceeds maxRiskPercent',
        path: ['riskPercent'],
      })
      .refine((a) => a.minLot <= a.maxLot, { message: 'minLot exceeds maxLot', path: ['minLot'] }),
    indicators: z
      .object({
        emaFast: positiveInt,
        emaSlow: positiveInt,
        rsiPeriod: positiveInt,
        warmupCandles: positiveInt,
      })
      .strict()
      .refine((i) => i.emaFast < i.emaSlow, { message: 'emaFast must be < emaSlow', path: ['emaFast'] })
      .refine((i) => i.warmupCandles >= i.emaSlow, {
        message: 'warmupCandles must be >= emaSlow',
        path: ['warmupCandles'],
      }),
    strategy: z
      .object({
        pullbackLookback: positiveInt,
        swingLookback: positiveInt,
        rsi: z
          .object({
            oversold: z.number().min(0).max(100),
            mid: z.number().min(0).max(100),
            lookback: z.number().int().nonnegative(),
            mode: z.enum(['both', 'recovery_only', 'above_mid_only']),
            requireRising: z.boolean(),
          })
          .strict(),
        pin: z
          .object({
            wickBodyRatio: nonNegative,
            wickRangeRatio: z.number().min(0).max(1),
            maxUpperRatio: z.number().min(0).max(1),
            requireBullishBody: z.boolean(),
          })
          .strict(),
        timeframes: z.object({ M15: timeframeParams, M30: timeframeParams, H1: timeframeParams }).strict(),
      })
      .strict(),
    entry: z
      .object({
        mode: z.enum(['close_offset', 'candle_mid']),
        validCandles: positiveInt,
      })
      .strict(),
    sizing: z.object({ minSlPips: nonNegative }).strict(),
    alerts: z
      .object({
        timezone: z.string().refine(isValidTimeZone, 'unknown IANA time zone'),
        windowStart: clock,
        windowEnd: clock,
        maxPerDay: z.number().int().nonnegative(),
        overCapRule: z.literal('chronological'),
        cooldownCandles: z.number().int().nonnegative(),
        liveTimeframe: z.enum(['M15', 'M30', 'H1']),
      })
      .strict()
      .refine((a) => a.windowStart < a.windowEnd, { message: 'windowStart must be before windowEnd' }),
    execution: z
      .object({
        quoteMode: z.enum(['strict', 'candle_close_fallback']),
        maxQuoteAgeSec: positive,
        maxSignalLatencySec: positive,
        minLimitDistancePips: nonNegative,
        candleSettleSec: nonNegative,
        assumedSpreadPips: nonNegative,
      })
      .strict(),
    backtest: z
      .object({
        placementDelaySec: nonNegative,
        /** PDF market-at-next-open entry as a backtest-only baseline (PDF review P6). */
        includePdfMarketBaseline: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type AppConfig = z.infer<typeof configSchema>;
export type TimeframeParams = z.infer<typeof timeframeParams>;

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
