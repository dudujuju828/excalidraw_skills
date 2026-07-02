import type { Shape } from "./types.js";

export const FONT_SIZE = 20;
export const EDGE_FONT_SIZE = 16;
export const LINE_HEIGHT = 1.25;

// Virgil (Excalidraw's hand-drawn font) averages roughly 0.6em per glyph.
const CHAR_WIDTH_EM = 0.6;

export interface TextSize {
  width: number;
  height: number;
  lines: string[];
}

export function measureText(text: string, fontSize = FONT_SIZE): TextSize {
  const lines = text.split("\n");
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return {
    width: Math.ceil(longest * fontSize * CHAR_WIDTH_EM),
    height: Math.ceil(lines.length * fontSize * LINE_HEIGHT),
    lines,
  };
}

/**
 * Container size for a node label. Ellipses and diamonds inscribe the
 * text box, so they need extra room relative to a rectangle.
 */
export function nodeSize(label: string, shape: Shape): { width: number; height: number } {
  const t = measureText(label);
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
