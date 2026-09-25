import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { configSchema, type AppConfig } from './schema.js';

export class ConfigError extends Error {}

/** Validates a parsed config object; throws ConfigError listing every problem. */
export function parseConfig(raw: unknown): AppConfig {
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new ConfigError(`Invalid config:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}

export function parseConfigYaml(text: string): AppConfig {
  return parseConfig(parse(text));
}

export async function loadConfig(path: string): Promise<AppConfig> {
  return parseConfigYaml(await readFile(path, 'utf8'));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Stable hash of the effective parameter set; stored on every decision record. */
export function configHash(config: AppConfig): string {
  return `sha256:${createHash('sha256').update(canonicalJson(config)).digest('hex')}`;
}
