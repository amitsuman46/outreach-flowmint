type Rgb = [number, number, number];

export const FALLBACK_PRIMARY = "#2f6f68";

export function parseHex(hex: string): Rgb | null {
  const match = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}

export function mix(hex: string, target: string, amount: number): string {
  const a = parseHex(hex) ?? parseHex(FALLBACK_PRIMARY)!;
  const b = parseHex(target)!;
  return toHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as Rgb);
}

function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((part) => {
    const c = part / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Darkens a brand color until white text on it is readable. */
export function readablePrimary(hex: string): string {
  let color = parseHex(hex) ? hex : FALLBACK_PRIMARY;
  for (let step = 0; step < 12 && contrast(color, "#ffffff") < 4.5; step += 1) {
    color = mix(color, "#000000", 0.12);
  }
  return color;
}
