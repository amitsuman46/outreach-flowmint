export const OPT_OUT_LINE =
  'If this isn\'t useful, reply "stop" and I won\'t email you again.';

export function ensureOptOut(body: string): string {
  const trimmed = body.trim();
  if (trimmed.toLowerCase().includes('reply "stop"')) return trimmed;
  return `${trimmed}\n\n${OPT_OUT_LINE}`;
}
