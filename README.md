# excalidraw_skills

MCP server that lets AI agents draw diagrams as [Obsidian Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) notes.

Say *"Draw me on excalidraw a workflow of RSA encryption"* to your agent, and a ready-to-open `.excalidraw.md` file appears in your vault.

## Why not just have the model write Excalidraw JSON?

LLMs are good at naming the nodes and edges of a concept, and bad at the geometry and bookkeeping of the Excalidraw format: arrow bindings (`startBinding`/`endBinding` + matching `boundElements` on both shapes), container-bound text labels, consistent ids/seeds, and non-overlapping coordinates. This server accepts a high-level graph spec and handles all of that:

- **Auto-layout** — layered (Sugiyama-style) top-down or left-right layout: sources are pulled next to their first consumer, long edges are routed through reserved corridors between nodes (never through boxes), and crossings are minimized with iterative barycenter sweeps
- **Cycles welcome** — request/response round trips (DNS, TCP, RPC…) work: back edges are reversed internally for ranking and routing, and opposite-direction arrows between the same nodes get separate parallel lanes so arrows and labels never pile up
- **Proper bindings** — arrows stay attached when you move nodes in Obsidian
- **Contained labels** — text is bound inside shapes, edge labels bound to arrows
- **Vault format** — writes the `excalidraw-plugin: parsed` markdown format with a `## Text Elements` section, so labels are linkable block references

## Install

### Quick start (recommended)

```sh
npx -y excalidraw-skills setup
```

The interactive wizard finds your Obsidian vaults (from Obsidian's own config), checks that the Excalidraw plugin is installed, registers the server with Claude Code and/or Claude Desktop for you, and finishes by writing a test diagram into the vault. Re-running it is safe — it replaces the existing registration.

### One-liner (Claude Code, no clone)

```sh
claude mcp add excalidraw -e EXCALIDRAW_VAULT_PATH="/path/to/your/vault" -- npx -y excalidraw-skills
```

(To run the latest unpublished code instead, use `npx -y github:dudujuju828/excalidraw_skills` in either command.)

### Manual (from a clone)

```sh
git clone https://github.com/dudujuju828/excalidraw_skills
cd excalidraw_skills
npm install
npm run setup   # same wizard as above
```

Or skip the wizard and register by hand — Claude Code:

```sh
claude mcp add excalidraw --scope user -e EXCALIDRAW_VAULT_PATH="/path/to/your/vault" -- node /path/to/excalidraw_skills/dist/index.js
```

Claude Desktop / other MCP clients:

```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "node",
      "args": ["/path/to/excalidraw_skills/dist/index.js"],
      "env": { "EXCALIDRAW_VAULT_PATH": "/path/to/your/vault" }
    }
  }
}
```

Configuration:

- `EXCALIDRAW_VAULT_PATH` (or `OBSIDIAN_VAULT_PATH`, or `--vault=<path>` arg) — vault root, **required**
- `EXCALIDRAW_FOLDER` — default vault folder for new diagrams (default: `Excalidraw`)
- `EXCALIDRAW_FONT` — default label font: `normal` (clean sans-serif, default), `hand-drawn`, or `code`

## Tool: `create_diagram`

```jsonc
{
  "name": "RSA Encryption Workflow",   // becomes the note's file name
  "folder": "Diagrams",                // optional, vault-relative
  "direction": "down",                 // or "right"
  "nodes": [
    { "id": "primes", "label": "Choose two large primes\np, q" },
    { "id": "pub", "label": "Public key\n(e, n)", "shape": "ellipse", "color": "green" }
  ],
  "edges": [
    { "from": "primes", "to": "pub", "label": "publish", "style": "dashed" }
  ]
}
```

- `shape`: `rectangle` (default) | `ellipse` | `diamond`
- `color`: `default` | `red` | `green` | `blue` | `yellow` | `violet` | `orange` (Excalidraw's standard palette)
- `style`: `solid` (default) | `dashed` | `dotted`
- `font` (top-level, optional): `normal` (default) | `hand-drawn` | `code`

Existing files are never overwritten — a numeric suffix is added instead.

See [`examples/RSA Encryption Workflow.excalidraw.md`](examples/RSA%20Encryption%20Workflow.excalidraw.md) for generated output ([`scripts/demo.mjs`](scripts/demo.mjs) regenerates it and doubles as a smoke test: `npm run demo`).

## Roadmap

- `add_to_diagram` — extend an existing drawing
- Mermaid input via `@excalidraw/mermaid-to-excalidraw`
- Groups / swim lanes

## License

MIT
