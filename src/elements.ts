import { makeId, randomSeed } from "./id.js";
import {
  DEFAULT_FONT,
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
  Font,
  Shape,
} from "./types.js";

// Excalidraw's built-in font families ("normal" and "code" are what the
// current picker calls Nunito and Comic Shanns).
const FONT_CODES: Record<Font, number> = {
  "hand-drawn": 5, // Excalifont
  normal: 6, // Nunito
  code: 8, // Comic Shanns
};

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
  font: Font = DEFAULT_FONT,
  fontSize: number = FONT_SIZE,
): ExcalidrawElement {
  const size = measureText(text, fontSize, font);
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
    fontFamily: FONT_CODES[font],
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

function pullToward(
  p: { x: number; y: number },
  target: { x: number; y: number },
  distance: number,
): { x: number; y: number } {
  const len = Math.hypot(target.x - p.x, target.y - p.y) || 1;
  return {
    x: p.x + ((target.x - p.x) / len) * distance,
    y: p.y + ((target.y - p.y) / len) * distance,
  };
}

/**
 * Arrow between two shapes, bound on both ends so Excalidraw keeps it
 * attached when nodes are moved. Long edges pass `waypoints` (from the
 * layout's dummy nodes) and are drawn as a curve through them instead of
 * a straight diagonal. When several straight arrows connect the same pair
 * of nodes (a request/response round trip), `laneOffset` shifts each one
 * perpendicular to the connecting line so they don't draw on top of each
 * other. Mutates both shapes' boundElements.
 */
export function arrowElement(
  from: { el: ExcalidrawElement; box: Box; shape: Shape },
  to: { el: ExcalidrawElement; box: Box; shape: Shape },
  style: EdgeStyle,
  waypoints: Array<{ x: number; y: number }> = [],
  laneOffset = 0,
): ExcalidrawElement {
  let firstTarget = waypoints[0] ?? center(to.box);
  let lastTarget = waypoints[waypoints.length - 1] ?? center(from.box);

  if (laneOffset !== 0 && waypoints.length === 0) {
    // Aim at points shifted sideways from the true centers, so the border
    // exit/entry points of parallel arrows spread out along the borders.
    const c1 = center(from.box);
    const c2 = center(to.box);
    const len = Math.hypot(c2.x - c1.x, c2.y - c1.y) || 1;
    const px = (-(c2.y - c1.y) / len) * laneOffset;
    const py = ((c2.x - c1.x) / len) * laneOffset;
    firstTarget = { x: c2.x + px, y: c2.y + py };
    lastTarget = { x: c1.x + px, y: c1.y + py };
  }

  // Leave the border aiming at the first bend, arrive aiming from the
  // last one, with ARROW_GAP px of air on both ends.
  const start = pullToward(
    borderPoint(from.box, from.shape, firstTarget),
    firstTarget,
    ARROW_GAP,
  );
  const end = pullToward(
    borderPoint(to.box, to.shape, lastTarget),
    lastTarget,
    ARROW_GAP,
  );

  const points = [start, ...waypoints, end].map((p) => [
    p.x - start.x,
    p.y - start.y,
  ]);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const el = base("arrow", {
    x: start.x,
    y: start.y,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  });
  Object.assign(el, {
    strokeStyle: style,
    roundness: { type: 2 },
    points,
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

export function labelForArrow(
  text: string,
  arrow: ExcalidrawElement,
  font: Font = DEFAULT_FONT,
): ExcalidrawElement {
  return boundText(text, arrow, font, EDGE_FONT_SIZE);
}
