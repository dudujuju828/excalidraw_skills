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
