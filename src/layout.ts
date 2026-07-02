import { nodeSize } from "./measure.js";
import type { Box, DiagramSpec, NodeSpec } from "./types.js";

const ROW_GAP = 100;
const COL_GAP = 70;

/**
 * Layered ("Sugiyama-lite") layout: rank nodes by longest path from a
 * source, order each rank by the average position of predecessors, then
 * place ranks as centered rows (direction "down") or columns ("right").
 */
export function layoutDiagram(spec: DiagramSpec): Map<string, Box> {
  const nodes = spec.nodes;
  const index = new Map(nodes.map((n, i) => [n.id, i]));

  // Longest-path ranking, Bellman-Ford style. The iteration cap makes
  // cycles terminate instead of looping forever.
  const rank = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (let iter = 0; iter < nodes.length; iter++) {
    let changed = false;
    for (const e of spec.edges) {
      const candidate = rank.get(e.from)! + 1;
      if (rank.get(e.to)! < candidate) {
        rank.set(e.to, candidate);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const maxRank = Math.max(...[...rank.values()], 0);
  const rows: NodeSpec[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of nodes) rows[rank.get(n.id)!].push(n);

  // One barycenter pass: order each row by mean predecessor order in the
  // row above, keeping spec order as the tiebreaker.
  const orderInRow = new Map<string, number>();
  for (const row of rows) {
    const keyed = row.map((n) => {
      const preds = spec.edges
        .filter((e) => e.to === n.id && orderInRow.has(e.from))
        .map((e) => orderInRow.get(e.from)!);
      const bary = preds.length
        ? preds.reduce((a, b) => a + b, 0) / preds.length
        : index.get(n.id)!;
      return { n, bary };
    });
    keyed.sort((a, b) => a.bary - b.bary || index.get(a.n.id)! - index.get(b.n.id)!);
    row.length = 0;
    keyed.forEach((k, i) => {
      row.push(k.n);
      orderInRow.set(k.n.id, i);
    });
  }

  const sizes = new Map(
    nodes.map((n) => [n.id, nodeSize(n.label, n.shape ?? "rectangle")]),
  );
  const boxes = new Map<string, Box>();
  const down = (spec.direction ?? "down") === "down";

  let main = 0; // y for "down", x for "right"
  for (const row of rows) {
    if (row.length === 0) continue;
    const rowThickness = Math.max(
      ...row.map((n) => (down ? sizes.get(n.id)!.height : sizes.get(n.id)!.width)),
    );
    const crossTotal =
      row.reduce(
        (sum, n) => sum + (down ? sizes.get(n.id)!.width : sizes.get(n.id)!.height),
        0,
      ) +
      COL_GAP * (row.length - 1);

    let cross = -crossTotal / 2;
    for (const n of row) {
      const s = sizes.get(n.id)!;
      if (down) {
        boxes.set(n.id, {
          x: cross,
          y: main + (rowThickness - s.height) / 2,
          width: s.width,
          height: s.height,
        });
        cross += s.width + COL_GAP;
      } else {
        boxes.set(n.id, {
          x: main + (rowThickness - s.width) / 2,
          y: cross,
          width: s.width,
          height: s.height,
        });
        cross += s.height + COL_GAP;
      }
    }
    main += rowThickness + ROW_GAP;
  }

  return boxes;
}
