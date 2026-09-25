/** Minimal CSV field splitter for the flat numeric files we ingest (no embedded commas). */
export function splitCsvLine(line: string): string[] {
  return line.split(',').map((field) => field.trim().replace(/^"(.*)"$/, '$1').trim());
}

export function findColumn(header: readonly string[], names: readonly string[]): number {
  const lower = header.map((h) => h.toLowerCase());
  for (const name of names) {
    const index = lower.indexOf(name.toLowerCase());
    if (index >= 0) return index;
  }
  return -1;
}

/** Parses ISO-8601 (space or 'T' separator; UTC assumed when no offset) or epoch milliseconds. */
export function parseTimestamp(text: string): number {
  if (/^\d+$/.test(text)) return Number(text);
  let iso = text.includes('T') ? text : text.replace(' ', 'T');
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += 'Z';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid timestamp: ${text}`);
  return ms;
}
