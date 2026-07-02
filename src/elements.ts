import { makeId, randomSeed } from "./id.js";
import {
  EDGE_FONT_SIZE,
  FONT_SIZE,
  LINE_HEIGHT,
  measureText,
} from "./measure.js";
import type {
  Box,
  Color,
  EdgeStyle,
  ExcalidrawElement,
  Shape,
} from "./types.js";

// Excalidraw's standard palette (open-color): dark stroke, light fill.
const COLORS: Record<Color, { stroke: string; bg: string }> = {
  default: { stroke: "#1e1e1e", bg: "transparent" },
  red: { stroke: "#e03131", bg: "#ffc9c9" },
  green: { stroke: "#2f9e44", bg: "#b2f2bb" },
  blue: { stroke: "#1971c2", bg: "#a5d8ff" },
  yellow: { stroke: "#f08c00", bg: "#ffec99" },
  violet: { stroke: "#6741d9", bg: "#d0bfff" },
  orange: { stroke: "#e8590c", bg: "#ffd8a8" },
};

const ARROW_GAP = 6;

function base(type: string, box: Box): ExcalidrawElement {
  return {
    id: makeId(),
    type,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: randomSeed(),
    version: 1,
    versionNonce: randomSeed(),
    isDeleted: false,
    boundElements: [] as Array<{ id: string; type: string }>,
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

export function shapeElement(shape: Shape, box: Box, color: Color): ExcalidrawElement {
  const el = base(shape, box);
  el.strokeColor = COLORS[color].stroke;
  el.backgroundColor = COLORS[color].bg;
  if (shape === "rectangle") el.roundness = { type: 3 };
  if (shape === "diamond") el.roundness = { type: 2 };
  return el;
}

/** Text element bound inside a container (node or arrow label). */
export function boundText(
  text: string,
  container: ExcalidrawElement,
  fontSize: number = FONT_SIZE,
): ExcalidrawElement {
  const size = measureText(text, fontSize);
  const cx = (container.x as number) + (container.width as number) / 2;
  const cy = (container.y as number) + (container.height as number) / 2;
  const el = base("text", {
    x: Math.round(cx - size.width / 2),
    y: Math.round(cy - size.height / 2),
    width: size.width,
    height: size.height,
  });
  Object.assign(el, {
    text,
    rawText: text,
    originalText: text,
    fontSize,
    fontFamily: 1,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: container.id,
    autoResize: true,
    lineHeight: LINE_HEIGHT,
  });
  (container.boundElements as Array<{ id: string; type: string }>).push({
    type: "text",
    id: el.id,
  });
  return el;
}

function center(box: Box): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Point where the line from this shape's center towards `target` crosses
 * the shape's border. Exact for rectangle, ellipse and diamond.
 */
function borderPoint(box: Box, shape: Shape, target: { x: number; y: number }) {
  const c = center(box);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  const a = box.width / 2;
  const b = box.height / 2;
  let t: number;
  if (dx === 0 && dy === 0) {
    t = 0;
  } else if (shape === "ellipse") {
    t = 1 / Math.hypot(dx / a, dy / b);
  } else if (shape === "diamond") {
    t = 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
  } else {
    t = Math.min(
      dx !== 0 ? a / Math.abs(dx) : Infinity,
      dy !== 0 ? b / Math.abs(dy) : Infinity,
    );
  }
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * Arrow between two shapes, bound on both ends so Excalidraw keeps it
 * attached when nodes are moved. Mutates both shapes' boundElements.
 */
export function arrowElement(
  from: { el: ExcalidrawElement; box: Box; shape: Shape },
  to: { el: ExcalidrawElement; box: Box; shape: Shape },
  style: EdgeStyle,
): ExcalidrawElement {
  let start = borderPoint(from.box, from.shape, center(to.box));
  let end = borderPoint(to.box, to.shape, center(from.box));

  // Pull both endpoints ARROW_GAP px off the borders.
  const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const ux = (end.x - start.x) / len;
  const uy = (end.y - start.y) / len;
  start = { x: start.x + ux * ARROW_GAP, y: start.y + uy * ARROW_GAP };
  end = { x: end.x - ux * ARROW_GAP, y: end.y - uy * ARROW_GAP };

  const el = base("arrow", {
    x: start.x,
    y: start.y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  });
  Object.assign(el, {
    strokeStyle: style,
    roundness: { type: 2 },
    points: [
      [0, 0],
      [end.x - start.x, end.y - start.y],
    ],
    lastCommittedPoint: null,
    startBinding: { elementId: from.el.id, focus: 0, gap: ARROW_GAP },
    endBinding: { elementId: to.el.id, focus: 0, gap: ARROW_GAP },
    startArrowhead: null,
    endArrowhead: "arrow",
    elbowed: false,
  });

  for (const shapeEl of [from.el, to.el]) {
    (shapeEl.boundElements as Array<{ id: string; type: string }>).push({
      id: el.id,
      type: "arrow",
    });
  }
  return el;
}

export function labelForArrow(text: string, arrow: ExcalidrawElement): ExcalidrawElement {
  return boundText(text, arrow, EDGE_FONT_SIZE);
}
