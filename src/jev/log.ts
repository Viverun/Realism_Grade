/**
 * Append-only JSONL log of Jev judgments (docs/v1/jev-research-spec.md §3). One line per
 * sample: the snapshot sent, the typed answers, every version identifier, and the V1 decision
 * facts needed to label the outcome later from ticks. Outcomes are never written here.
 */
import { appendFile, readFile } from 'node:fs/promises';
import type { Timeframe } from '../core/timeframe.js';
import type { Tier } from '../strategy/score.js';
import type { Answer } from './client.js';
import type { Snapshot } from './snapshot.js';

export interface JevLogRecord {
  id: string;
  scoredAt: string;
  snapshotVersion: string;
  promptHash: string;
  configHash: string;
  requestedModel: string;
  /** Model reported by the API; null when the call failed. */
  model: string | null;
  timeframe: Timeframe;
  closeTime: number;
  tier: Tier;
  /** Buy Limit entry and recommended stop, points (for labelling only; never sent to Jev). */
  entry: number;
  refSl: number;
  snapshot: Snapshot;
  answers: Record<string, Answer> | null;
  usage: { input_tokens?: number; output_tokens?: number } | null;
  latencyMs: number | null;
  error: string | null;
}

export async function readJevLog(path: string): Promise<JevLogRecord[]> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line, n) => {
      try {
        return JSON.parse(line) as JevLogRecord;
      } catch {
        throw new Error(`${path}:${n + 1}: invalid JSON line`);
      }
    });
}

export async function appendJevLog(path: string, records: readonly JevLogRecord[]): Promise<void> {
  if (records.length) await appendFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
}
