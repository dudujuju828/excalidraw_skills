import type { Font, Shape } from "./types.js";

export const FONT_SIZE = 20;
export const EDGE_FONT_SIZE = 16;
export const LINE_HEIGHT = 1.25;

export const DEFAULT_FONT: Font = "normal";

// Average glyph width per font, in em. Slightly generous on purpose so
// container text never wraps.
const CHAR_WIDTH_EM: Record<Font, number> = {
  normal: 0.55, // Nunito
  "hand-drawn": 0.6, // Excalifont
  code: 0.62, // Comic Shanns (monospace)
};

export interface TextSize {
  width: number;
  height: number;
  lines: string[];
}

export function measureText(
  text: string,
  fontSize = FONT_SIZE,
  font: Font = DEFAULT_FONT,
): TextSize {
  const lines = text.split("\n");
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return {
    width: Math.ceil(longest * fontSize * CHAR_WIDTH_EM[font]),
    height: Math.ceil(lines.length * fontSize * LINE_HEIGHT),
    lines,
  };
}

/**
 * Container size for a node label. Ellipses and diamonds inscribe the
 * text box, so they need extra room relative to a rectangle.
 */
export function nodeSize(
  label: string,
  shape: Shape,
  font: Font = DEFAULT_FONT,
): { width: number; height: number } {
  const t = measureText(label, FONT_SIZE, font);
  let width: number;
  let height: number;
  switch (shape) {
    case "ellipse":
      width = t.width * 1.4 + 30;
      height = t.height * 1.7 + 20;
      break;
    case "diamond":
      width = t.width * 1.8 + 30;
      height = t.height * 2.4 + 20;
      break;
    default:
      width = t.width + 40;
      height = t.height + 30;
  }
  return {
    width: Math.max(Math.round(width), 120),
    height: Math.max(Math.round(height), 55),
  };
}
