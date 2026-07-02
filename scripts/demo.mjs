// Smoke test: builds the RSA workflow example, checks structural
// invariants, and writes examples/RSA Encryption Workflow.excalidraw.md
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { buildDiagram } from "../dist/diagram.js";
import { toExcalidrawMarkdown } from "../dist/markdown.js";

const spec = {
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
};

const built = buildDiagram(spec);
const { elements } = built.scene;
const byId = new Map(elements.map((el) => [el.id, el]));

// -- invariants ------------------------------------------------------------
const shapes = elements.filter((el) =>
  ["rectangle", "ellipse", "diamond"].includes(el.type),
);
const arrows = elements.filter((el) => el.type === "arrow");
const texts = elements.filter((el) => el.type === "text");

assert.equal(shapes.length, spec.nodes.length, "one shape per node");
assert.equal(arrows.length, spec.edges.length, "one arrow per edge");

for (const arrow of arrows) {
  for (const binding of [arrow.startBinding, arrow.endBinding]) {
    const target = byId.get(binding.elementId);
    assert.ok(target, "arrow binds to an existing element");
    assert.ok(
      target.boundElements.some((b) => b.id === arrow.id && b.type === "arrow"),
      "bound shape references the arrow back",
    );
  }
}

for (const text of texts) {
  const container = byId.get(text.containerId);
  assert.ok(container, "every text has a container");
  assert.ok(
    container.boundElements.some((b) => b.id === text.id && b.type === "text"),
    "container references its text back",
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
    assert.ok(apart, `shapes ${a.id} and ${b.id} must not overlap`);
  }
}

// -- readability: count arrow-arrow crossings and arrow-box overlaps ------
function properCross(p1, p2, p3, p4) {
  const side = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = side(p3, p4, p1);
  const d2 = side(p3, p4, p2);
  const d3 = side(p1, p2, p3);
  const d4 = side(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

const polylines = arrows.map((a) => ({
  arrow: a,
  bound: new Set([a.startBinding.elementId, a.endBinding.elementId]),
  pts: a.points.map(([px, py]) => [a.x + px, a.y + py]),
}));

let crossings = 0;
for (let i = 0; i < polylines.length; i++) {
  for (let j = i + 1; j < polylines.length; j++) {
    const a = polylines[i];
    const b = polylines[j];
    // Arrows sharing a node meet near its border by design; skip those.
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

let boxHits = 0;
for (const { arrow, bound, pts } of polylines) {
  for (const shape of shapes) {
    if (bound.has(shape.id)) continue;
    const corners = [
      [shape.x, shape.y],
      [shape.x + shape.width, shape.y],
      [shape.x + shape.width, shape.y + shape.height],
      [shape.x, shape.y + shape.height],
    ];
    const inside = ([px, py]) =>
      px > shape.x && px < shape.x + shape.width && py > shape.y && py < shape.y + shape.height;
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

console.log(`crossings between unrelated arrows: ${crossings}`);
console.log(`arrows cutting through foreign boxes: ${boxHits}`);
assert.ok(crossings <= 1, `too many arrow crossings: ${crossings}`);
assert.equal(boxHits, 0, "no arrow may pass through a box it is not bound to");

const markdown = toExcalidrawMarkdown(built);
assert.match(markdown, /excalidraw-plugin: parsed/);
const jsonBlock = markdown.match(/```json\n([\s\S]*?)\n```/);
assert.ok(jsonBlock, "markdown contains a json drawing block");
JSON.parse(jsonBlock[1]); // must round-trip

await mkdir(new URL("../examples/", import.meta.url), { recursive: true });
const out = new URL(
  "../examples/RSA Encryption Workflow.excalidraw.md",
  import.meta.url,
);
await writeFile(out, markdown, "utf8");

console.log(
  `ok: ${shapes.length} shapes, ${arrows.length} arrows, ${texts.length} texts -> examples/RSA Encryption Workflow.excalidraw.md`,
);
