# excalidraw_skills

MCP server that lets AI agents draw diagrams as [Obsidian Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) notes.

Say *"Draw me on excalidraw a workflow of RSA encryption"* to your agent, and a ready-to-open `.excalidraw.md` file appears in your vault.

## Why not just have the model write Excalidraw JSON?

LLMs are good at naming the nodes and edges of a concept, and bad at the geometry and bookkeeping of the Excalidraw format: arrow bindings (`startBinding`/`endBinding` + matching `boundElements` on both shapes), container-bound text labels, consistent ids/seeds, and non-overlapping coordinates. This server accepts a high-level graph spec and handles all of that:

- **Auto-layout** — layered top-down (or left-right) layout with a barycenter pass to reduce arrow crossings
- **Proper bindings** — arrows stay attached when you move nodes in Obsidian
- **Contained labels** — text is bound inside shapes, edge labels bound to arrows
- **Vault format** — writes the `excalidraw-plugin: parsed` markdown format with a `## Text Elements` section, so labels are linkable block references

## Install

```sh
git clone https://github.com/dudujuju828/excalidraw_skills
cd excalidraw_skills
npm install && npm run build
```

### Claude Code

```sh
claude mcp add --scope user excalidraw \
  --env EXCALIDRAW_VAULT_PATH="C:/path/to/your/vault" \
  -- node /path/to/excalidraw_skills/dist/index.js
```

### Claude Desktop / other MCP clients

```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "node",
      "args": ["/path/to/excalidraw_skills/dist/index.js"],
      "env": { "EXCALIDRAW_VAULT_PATH": "C:/path/to/your/vault" }
    }
  }
}
```

Configuration:

- `EXCALIDRAW_VAULT_PATH` (or `OBSIDIAN_VAULT_PATH`, or `--vault=<path>` arg) — vault root, **required**
- `EXCALIDRAW_FOLDER` — default vault folder for new diagrams (default: `Excalidraw`)

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

Existing files are never overwritten — a numeric suffix is added instead.

See [`examples/RSA Encryption Workflow.excalidraw.md`](examples/RSA%20Encryption%20Workflow.excalidraw.md) for generated output ([`scripts/demo.mjs`](scripts/demo.mjs) regenerates it and doubles as a smoke test: `npm run demo`).

## Roadmap

- `add_to_diagram` — extend an existing drawing
- Mermaid input via `@excalidraw/mermaid-to-excalidraw`
- Groups / swim lanes

## License

MIT
