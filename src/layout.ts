import { nodeSize } from "./measure.js";
import type { Box, DiagramSpec } from "./types.js";

const ROW_GAP = 100;
const COL_GAP = 70;
const DUMMY_SIZE = 8;
const SWEEPS = 8;

export interface LayoutResult {
  boxes: Map<string, Box>;
  /** Bend points per edge index, for edges routed through intermediate rows. */
  waypoints: Map<number, Array<{ x: number; y: number }>>;
}

/** A real node or a dummy standing in for a long edge crossing a row. */
interface LNode {
  key: string;
  rank: number;
  width: number;
  height: number;
  /** Edge index this dummy belongs to; undefined for real nodes. */
  dummyFor?: number;
}

/** One rank-adjacent hop; long edges contribute a chain of these. */
interface Segment {
  from: string;
  to: string;
}

/**
 * Layered (Sugiyama-style) layout:
 *   1. rank by longest path, then pull sources down next to their
 *      earliest consumer so they don't trail edges across the diagram;
 *   2. split edges spanning >1 rank with dummy nodes, so the ordering
 *      step reserves a corridor for them between real nodes;
 *   3. minimize crossings with alternating down/up barycenter sweeps,
 *      keeping the best ordering seen (fewest crossings, straightest
 *      corridors);
 *   4. place ranks as centered rows ("down") or columns ("right"). Each
 *      dummy becomes two bend points — where its edge enters and leaves
 *      the row band — so edges run straight through rows and only drift
 *      sideways in the empty gaps between them, where no boxes live.
 */
export function layoutDiagram(spec: DiagramSpec): LayoutResult {
  const rank = computeRanks(spec);
  const { lnodes, segments, chains } = insertDummies(spec, rank);
  // Full node-to-node paths of the routed edges, for bend scoring.
  const paths = [...chains.entries()].map(([edgeIdx, chain]) => [
    spec.edges[edgeIdx].from,
    ...chain,
    spec.edges[edgeIdx].to,
  ]);
  const layers = orderLayers(lnodes, segments, paths);
  return assignCoordinates(spec, layers, chains);
}

function computeRanks(spec: DiagramSpec): Map<string, number> {
  // Longest-path ranking, Bellman-Ford style. The iteration cap makes
  // cycles terminate instead of looping forever.
  const rank = new Map<string, number>(spec.nodes.map((n) => [n.id, 0]));
  for (let iter = 0; iter < spec.nodes.length; iter++) {
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

  // Longest-path ranking leaves every source in row 0 even when its first
  // consumer is far below, which trails a long edge across every row in
  // between. Pull each source down to just above its earliest consumer.
  const hasIncoming = new Set(spec.edges.map((e) => e.to));
  for (const n of spec.nodes) {
    if (hasIncoming.has(n.id)) continue;
    const succRanks = spec.edges
      .filter((e) => e.from === n.id)
      .map((e) => rank.get(e.to)!);
    if (succRanks.length) rank.set(n.id, Math.min(...succRanks) - 1);
  }
  return rank;
}

interface DummyPlan {
  lnodes: Map<string, LNode>;
  segments: Segment[];
  chains: Map<number, string[]>;
}

function insertDummies(spec: DiagramSpec, rank: Map<string, number>): DummyPlan {
  const lnodes = new Map<string, LNode>();
  for (const n of spec.nodes) {
    const size = nodeSize(n.label, n.shape ?? "rectangle", spec.font);
    lnodes.set(n.id, { key: n.id, rank: rank.get(n.id)!, ...size });
  }

  const segments: Segment[] = [];
  const chains = new Map<number, string[]>();
  spec.edges.forEach((e, i) => {
    const rFrom = rank.get(e.from)!;
    const rTo = rank.get(e.to)!;
    // Flat and backward edges (only possible with cycles) are drawn as
    // straight arrows and stay out of the ordering.
    if (rTo - rFrom < 1) return;

    let prev = e.from;
    const chain: string[] = [];
    for (let r = rFrom + 1; r < rTo; r++) {
      const key = `edge${i}.r${r}`;
      lnodes.set(key, {
        key,
        rank: r,
        width: DUMMY_SIZE,
        height: DUMMY_SIZE,
        dummyFor: i,
      });
      segments.push({ from: prev, to: key });
      chain.push(key);
      prev = key;
    }
    segments.push({ from: prev, to: e.to });
    if (chain.length > 0) chains.set(i, chain);
  });
  return { lnodes, segments, chains };
}

function orderLayers(
  lnodes: Map<string, LNode>,
  segments: Segment[],
  paths: string[][],
): LNode[][] {
  const maxRank = Math.max(...[...lnodes.values()].map((n) => n.rank), 0);
  const layers: LNode[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of lnodes.values()) layers[n.rank].push(n);

  const above = new Map<string, string[]>();
  const below = new Map<string, string[]>();
  for (const s of segments) {
    (below.get(s.from) ?? below.set(s.from, []).get(s.from)!).push(s.to);
    (above.get(s.to) ?? above.set(s.to, []).get(s.to)!).push(s.from);
  }

  const pos = new Map<string, number>();
  const syncPos = (layer: LNode[]) =>
    layer.forEach((n, i) => pos.set(n.key, i));
  layers.forEach(syncPos);

  // Two segments between the same pair of ranks cross iff their tops and
  // bottoms are ordered oppositely.
  const rankOf = (key: string) => lnodes.get(key)!.rank;
  const countCrossings = (): number => {
    let total = 0;
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        if (rankOf(segments[i].from) !== rankOf(segments[j].from)) continue;
        const dTop = pos.get(segments[i].from)! - pos.get(segments[j].from)!;
        const dBottom = pos.get(segments[i].to)! - pos.get(segments[j].to)!;
        if (dTop * dBottom < 0) total++;
      }
    }
    return total;
  };

  // Crossing count alone can't tell a straight corridor from a zigzag
  // one (both may cross the same edges once), but a zigzag sweeps
  // horizontally through a row and cuts boxes there. Score how much each
  // routed edge drifts across its layers and use it as a tiebreaker.
  const norm = (key: string): number => {
    const size = layers[rankOf(key)].length;
    return size > 1 ? pos.get(key)! / (size - 1) : 0.5;
  };
  const countBends = (): number => {
    let total = 0;
    for (const path of paths) {
      for (let i = 0; i + 1 < path.length; i++) {
        total += Math.abs(norm(path[i + 1]) - norm(path[i]));
      }
    }
    return total;
  };

  const sortByNeighbors = (r: number, neighbors: Map<string, string[]>) => {
    const keyed = layers[r].map((n, i) => {
      const ns = neighbors.get(n.key) ?? [];
      const bary = ns.length
        ? ns.reduce((sum, k) => sum + pos.get(k)!, 0) / ns.length
        : i; // nodes without neighbors keep their spot
      return { n, bary, i };
    });
    keyed.sort((a, b) => a.bary - b.bary || a.i - b.i);
    layers[r] = keyed.map((k) => k.n);
    syncPos(layers[r]);
  };

  let best = layers.map((l) => [...l]);
  let bestCrossings = countCrossings();
  let bestBends = countBends();
  for (let iter = 0; iter < SWEEPS; iter++) {
    if (iter % 2 === 0) {
      for (let r = 1; r <= maxRank; r++) sortByNeighbors(r, above);
    } else {
      for (let r = maxRank - 1; r >= 0; r--) sortByNeighbors(r, below);
    }
    const crossings = countCrossings();
    const bends = countBends();
    if (
      crossings < bestCrossings ||
      (crossings === bestCrossings && bends < bestBends - 1e-9)
    ) {
      bestCrossings = crossings;
      bestBends = bends;
      best = layers.map((l) => [...l]);
    }
  }
  return best;
}

function assignCoordinates(
  spec: DiagramSpec,
  layers: LNode[][],
  chains: Map<number, string[]>,
): LayoutResult {
  const down = (spec.direction ?? "down") === "down";
  const boxes = new Map<string, Box>();
  const bends = new Map<string, Array<{ x: number; y: number }>>();

  let main = 0; // y for "down", x for "right"
  for (const layer of layers) {
    if (layer.length === 0) continue;
    const thickness = Math.max(...layer.map((n) => (down ? n.height : n.width)));
    const crossTotal =
      layer.reduce((sum, n) => sum + (down ? n.width : n.height), 0) +
      COL_GAP * (layer.length - 1);

    let cross = -crossTotal / 2;
    for (const n of layer) {
      const extent = down ? n.width : n.height;
      const cCross = cross + extent / 2;
      if (n.dummyFor === undefined) {
        const cMain = main + thickness / 2;
        const cx = down ? cCross : cMain;
        const cy = down ? cMain : cCross;
        boxes.set(n.key, {
          x: cx - n.width / 2,
          y: cy - n.height / 2,
          width: n.width,
          height: n.height,
        });
      } else {
        // Entry and exit of the row band, at the corridor's position.
        bends.set(
          n.key,
          down
            ? [
                { x: cCross, y: main },
                { x: cCross, y: main + thickness },
              ]
            : [
                { x: main, y: cCross },
                { x: main + thickness, y: cCross },
              ],
        );
      }
      cross += extent + COL_GAP;
    }
    main += thickness + ROW_GAP;
  }

  const waypoints = new Map<number, Array<{ x: number; y: number }>>();
  for (const [edgeIdx, chain] of chains) {
    waypoints.set(edgeIdx, chain.flatMap((key) => bends.get(key)!));
  }
  return { boxes, waypoints };
}
