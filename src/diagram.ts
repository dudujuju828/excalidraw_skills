import { arrowElement, boundText, labelForArrow, shapeElement } from "./elements.js";
import { layoutDiagram } from "./layout.js";
import type { Box, DiagramSpec, ExcalidrawElement, Scene, Shape } from "./types.js";

export interface BuiltDiagram {
  scene: Scene;
  /** Text elements in scene order, for the "## Text Elements" section. */
  textElements: Array<{ id: string; text: string }>;
}

export function validateSpec(spec: DiagramSpec): void {
  if (spec.nodes.length === 0) {
    throw new Error("Diagram needs at least one node.");
  }
  const seen = new Set<string>();
  for (const n of spec.nodes) {
    if (seen.has(n.id)) throw new Error(`Duplicate node id: "${n.id}"`);
    seen.add(n.id);
  }
  for (const e of spec.edges) {
    for (const ref of [e.from, e.to]) {
      if (!seen.has(ref)) {
        throw new Error(
          `Edge ${e.from} -> ${e.to} references unknown node id "${ref}".`,
        );
      }
    }
    if (e.from === e.to) {
      throw new Error(`Self-loop on "${e.from}" is not supported yet.`);
    }
  }
}

export function buildDiagram(spec: DiagramSpec): BuiltDiagram {
  validateSpec(spec);
  const { boxes, waypoints } = layoutDiagram(spec);

  const shapes: ExcalidrawElement[] = [];
  const texts: ExcalidrawElement[] = [];
  const arrows: ExcalidrawElement[] = [];
  const byId = new Map<string, { el: ExcalidrawElement; box: Box; shape: Shape }>();

  for (const node of spec.nodes) {
    const shape = node.shape ?? "rectangle";
    const box = boxes.get(node.id)!;
    const el = shapeElement(shape, box, node.color ?? "default");
    shapes.push(el);
    texts.push(boundText(node.label, el));
    byId.set(node.id, { el, box, shape });
  }

  const arrowTexts: ExcalidrawElement[] = [];
  spec.edges.forEach((edge, i) => {
    const arrow = arrowElement(
      byId.get(edge.from)!,
      byId.get(edge.to)!,
      edge.style ?? "solid",
      waypoints.get(i) ?? [],
    );
    arrows.push(arrow);
    if (edge.label) arrowTexts.push(labelForArrow(edge.label, arrow));
  });

  // z-order: shapes, node labels, then arrows (and their labels) on top.
  const elements = [...shapes, ...texts, ...arrows, ...arrowTexts];

  const scene: Scene = {
    type: "excalidraw",
    version: 2,
    source: "https://github.com/dudujuju828/excalidraw_skills",
    elements,
    appState: {
      viewBackgroundColor: "#ffffff",
      gridSize: 20,
    },
    files: {},
  };

  return {
    scene,
    textElements: [...texts, ...arrowTexts].map((t) => ({
      id: t.id,
      text: t.text as string,
    })),
  };
}
