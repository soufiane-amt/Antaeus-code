import chalk from "chalk";

export const theme = {
  accent: "#A78BFA", // violet
  accent2: "#22D3EE", // cyan
  user: "#F0ABFC",
  success: "#4ADE80",
  error: "#F87171",
  warning: "#FBBF24",
  dim: "#71717A",
  muted: "#A1A1AA",
  border: "#3F3F46",
  userBg: "#27272A",
};

const GRADIENT = ["#C084FC", "#A78BFA", "#818CF8", "#60A5FA", "#22D3EE"];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorAt(t: number): [number, number, number] {
  const scaled = Math.min(Math.max(t, 0), 1) * (GRADIENT.length - 1);
  const i = Math.min(Math.floor(scaled), GRADIENT.length - 2);
  const f = scaled - i;
  const a = hexToRgb(GRADIENT[i]!);
  const b = hexToRgb(GRADIENT[i + 1]!);
  return [0, 1, 2].map((k) => Math.round(a[k]! + (b[k]! - a[k]!) * f)) as [
    number,
    number,
    number,
  ];
}

// Colors each character along the violet → cyan gradient.
// Pass `width` to align several lines to the same gradient.
export function gradient(text: string, width = text.length): string {
  return [...text]
    .map((ch, i) => {
      if (ch === " ") return ch;
      const [r, g, b] = colorAt(width <= 1 ? 0 : i / (width - 1));
      return chalk.rgb(r, g, b)(ch);
    })
    .join("");
}
