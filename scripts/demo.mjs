// Smoke test: builds example diagrams, checks structural and readability
// invariants, and writes examples/*.excalidraw.md
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { buildDiagram } from "../dist/diagram.js";
import { toExcalidrawMarkdown } from "../dist/markdown.js";

// --------------------------------------------------------------------------
// Example specs
// --------------------------------------------------------------------------

// A DAG: top-down derivation flow.
const rsa = {
  name: "RSA Encryption Workflow",
  maxCrossings: 1,
  spec: {
    direction: "down",
    nodes: [
      { id: "primes", label: "Choose two large primes\np, q" },
      { id: "msg", label: "Plaintext message m", shape: "ellipse", color: "yellow" },
      { id: "n", label: "Compute modulus\nn = p * q" },
      { id: "phi", label: "Compute totient\nphi(n) = (p-1)(q-1)" },
      { id: "e", label: "Choose public exponent e\ngcd(e, phi(n)) = 1" },
      { id: "d", label: "Compute private exponent\nd = e^-1 mod phi(n)" },
      { id: "pub", label: "Public key\n(e, n)", shape: "ellipse", color: "green" },
      { id: "priv", label: "Private key\n(d, n)", shape: "ellipse", color: "red" },
      { id: "enc", label: "Encrypt\nc = m^e mod n", color: "blue" },
      { id: "cipher", label: "Ciphertext c", shape: "ellipse", color: "yellow" },
      { id: "dec", label: "Decrypt\nm = c^d mod n", color: "blue" },
      { id: "out", label: "Recovered plaintext m", shape: "ellipse", color: "green" },
    ],
    edges: [
      { from: "primes", to: "n" },
      { from: "primes", to: "phi" },
      { from: "phi", to: "e" },
      { from: "e", to: "d" },
      { from: "n", to: "pub" },
      { from: "e", to: "pub", label: "publish" },
      { from: "n", to: "priv" },
      { from: "d", to: "priv", label: "keep secret" },
      { from: "msg", to: "enc" },
      { from: "pub", to: "enc" },
      { from: "enc", to: "cipher" },
      { from: "cipher", to: "dec" },
      { from: "priv", to: "dec" },
      { from: "dec", to: "out" },
    ],
  },
};

// A cyclic request/response round trip — the case that used to collapse
// into a single line of overlapping arrows and mushed labels.
const dns = {
  name: "DNS Resolution Round Trip",
  maxCrossings: 2,
  spec: {
    direction: "right",
    nodes: [
      { id: "pc", label: "Your Computer", shape: "ellipse" },
      { id: "res", label: "Recursive Resolver", color: "blue" },
      { id: "root", label: "Root Server" },
      { id: "tld", label: "TLD Server\n(.com)" },
      { id: "auth", label: "Authoritative Server\n(example.com)", color: "green" },
    ],
    edges: [
      { from: "pc", to: "res", label: "1. query" },
      { from: "res", to: "root", label: "2. who handles .com?" },
      { from: "res", to: "tld", label: "3. asks TLD" },
      { from: "res", to: "auth", label: "4. asks authoritative" },
      { from: "auth", to: "res", label: "5. IP address", style: "dashed" },
      { from: "res", to: "pc", label: "6. answer", style: "dashed" },
    ],
  },
};

// --------------------------------------------------------------------------
// Invariant + readability checks
// --------------------------------------------------------------------------
function properCross(p1, p2, p3, p4) {
  const side = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = side(p3, p4, p1);
  const d2 = side(p3, p4, p2);
  const d3 = side(p1, p2, p3);
  const d4 = side(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function check(name, spec, { maxCrossings }) {
  const built = buildDiagram(spec);
  const { elements } = built.scene;
  const byId = new Map(elements.map((el) => [el.id, el]));

  const shapes = elements.filter((el) =>
    ["rectangle", "ellipse", "diamond"].includes(el.type),
  );
  const arrows = elements.filter((el) => el.type === "arrow");
  const texts = elements.filter((el) => el.type === "text");

  assert.equal(shapes.length, spec.nodes.length, `${name}: one shape per node`);
  assert.equal(arrows.length, spec.edges.length, `${name}: one arrow per edge`);

  for (const arrow of arrows) {
    for (const binding of [arrow.startBinding, arrow.endBinding]) {
      const target = byId.get(binding.elementId);
      assert.ok(target, `${name}: arrow binds to an existing element`);
      assert.ok(
        target.boundElements.some((b) => b.id === arrow.id && b.type === "arrow"),
        `${name}: bound shape references the arrow back`,
      );
    }
  }

  for (const text of texts) {
    const container = byId.get(text.containerId);
    assert.ok(container, `${name}: every text has a container`);
    assert.ok(
      container.boundElements.some((b) => b.id === text.id && b.type === "text"),
      `${name}: container references its text back`,
    );
  }

  // No two node boxes overlap.
  for (const a of shapes) {
    for (const b of shapes) {
      if (a.id >= b.id) continue;
      const apart =
        a.x + a.width <= b.x ||
        b.x + b.width <= a.x ||
        a.y + a.height <= b.y ||
        b.y + b.height <= a.y;
      assert.ok(apart, `${name}: shapes ${a.id} and ${b.id} must not overlap`);
    }
  }

  const polylines = arrows.map((a) => ({
    bound: new Set([a.startBinding.elementId, a.endBinding.elementId]),
    pts: a.points.map(([px, py]) => [a.x + px, a.y + py]),
  }));

  // Crossings between arrows that share no endpoint.
  let crossings = 0;
  for (let i = 0; i < polylines.length; i++) {
    for (let j = i + 1; j < polylines.length; j++) {
      const a = polylines[i];
      const b = polylines[j];
      if ([...a.bound].some((id) => b.bound.has(id))) continue;
      let pairCrosses = false;
      for (let s = 0; s + 1 < a.pts.length; s++) {
        for (let t = 0; t + 1 < b.pts.length; t++) {
          if (properCross(a.pts[s], a.pts[s + 1], b.pts[t], b.pts[t + 1])) {
            pairCrosses = true;
          }
        }
      }
      if (pairCrosses) crossings++;
    }
  }

  // Arrows must not cut through boxes they are not bound to.
  let boxHits = 0;
  for (const { bound, pts } of polylines) {
    for (const shape of shapes) {
      if (bound.has(shape.id)) continue;
      const corners = [
        [shape.x, shape.y],
        [shape.x + shape.width, shape.y],
        [shape.x + shape.width, shape.y + shape.height],
        [shape.x, shape.y + shape.height],
      ];
      const inside = ([px, py]) =>
        px > shape.x && px < shape.x + shape.width &&
        py > shape.y && py < shape.y + shape.height;
      for (let s = 0; s + 1 < pts.length; s++) {
        const hitsEdge = corners.some((c, k) =>
          properCross(pts[s], pts[s + 1], c, corners[(k + 1) % 4]),
        );
        if (hitsEdge || inside(pts[s]) || inside(pts[s + 1])) {
          boxHits++;
          break;
        }
      }
    }
  }

  // Label-collision proxy: bound edge labels sit at arrow midpoints, so
  // midpoints of labelled arrows must keep some distance from each other.
  const midpoints = arrows
    .filter((a) => a.boundElements.some((b) => b.type === "text"))
    .map((a) => {
      const pts = a.points;
      const [mx, my] = pts[Math.floor(pts.length / 2)];
      return [a.x + mx, a.y + my];
    });
  let minLabelGap = Infinity;
  for (let i = 0; i < midpoints.length; i++) {
    for (let j = i + 1; j < midpoints.length; j++) {
      minLabelGap = Math.min(
        minLabelGap,
        Math.hypot(midpoints[i][0] - midpoints[j][0], midpoints[i][1] - midpoints[j][1]),
      );
    }
  }

  console.log(
    `${name}: crossings=${crossings} boxHits=${boxHits} ` +
      `minLabelGap=${minLabelGap === Infinity ? "n/a" : Math.round(minLabelGap)}`,
  );
  assert.ok(crossings <= maxCrossings, `${name}: too many crossings (${crossings})`);
  assert.equal(boxHits, 0, `${name}: arrows must not cut through foreign boxes`);
  if (midpoints.length > 1) {
    assert.ok(minLabelGap >= 24, `${name}: labelled arrows too close (${minLabelGap}px)`);
  }

  return built;
}

// --------------------------------------------------------------------------
// Run + write examples
// --------------------------------------------------------------------------
await mkdir(new URL("../examples/", import.meta.url), { recursive: true });

for (const example of [rsa, dns]) {
  const built = check(example.name, example.spec, example);
  const markdown = toExcalidrawMarkdown(built);
  assert.match(markdown, /excalidraw-plugin: parsed/);
  const jsonBlock = markdown.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(jsonBlock, "markdown contains a json drawing block");
  JSON.parse(jsonBlock[1]); // must round-trip

  const out = new URL(`../examples/${example.name}.excalidraw.md`, import.meta.url);
  await writeFile(out, markdown, "utf8");
}

console.log("ok: examples written");
