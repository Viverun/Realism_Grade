/**
 * Sends ONE synthetic test email through the provider configured in the environment
 * (see src/alerts/email-transport.ts). Live alerts are disabled; this never reads market data.
 *
 *   npm run email:demo                          # EMAIL_PROVIDER=console by default: prints only
 *   EMAIL_PROVIDER=file EMAIL_FROM=… EMAIL_TO=… npm run email:demo
 *   [--timeframe M15|M30|H1] [--config config/v1.yaml]
 */
import { loadConfig } from '../src/config/load.js';
import { isTimeframe } from '../src/core/timeframe.js';
import { renderSignalEmail } from '../src/alerts/email.js';
import { transportFromEnv } from '../src/alerts/email-transport.js';
import { syntheticSignal } from '../src/alerts/synthetic.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const k = argv.indexOf(name);
    return k >= 0 ? argv[k + 1] : undefined;
  };
  const config = await loadConfig(opt('--config') ?? 'config/v1.yaml');
  const tf = opt('--timeframe') ?? 'H1';
  if (!isTimeframe(tf)) throw new Error(`Unknown timeframe ${tf}`);
  const { decision, plan } = syntheticSignal(config, { timeframe: tf });
  const message = renderSignalEmail(decision, plan, config, 'synthetic');
  const transport = transportFromEnv();
  const result = await transport.send(message);
  process.stderr.write(`sent synthetic test email via ${result.provider}${result.id ? ` (${result.id})` : ''}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
