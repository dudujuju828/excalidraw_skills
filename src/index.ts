#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildDiagram } from "./diagram.js";
import { toExcalidrawMarkdown } from "./markdown.js";
import { resolveVaultPath, writeDiagram } from "./vault.js";
import type { DiagramSpec, Font } from "./types.js";

const FONTS = ["normal", "hand-drawn", "code"] as const;

/** Server-wide default font, from EXCALIDRAW_FONT (default "normal"). */
function defaultFont(): Font {
  const env = process.env.EXCALIDRAW_FONT;
  if (!env) return "normal";
  if ((FONTS as readonly string[]).includes(env)) return env as Font;
  throw new Error(
    `Invalid EXCALIDRAW_FONT "${env}"; expected one of: ${FONTS.join(", ")}`,
  );
}

const server = new McpServer({
  name: "excalidraw-skills",
  version: "0.1.0",
});

const nodeSchema = z.object({
  id: z.string().min(1).describe("Short unique id, referenced by edges"),
  label: z
    .string()
    .min(1)
    .describe("Text shown inside the node. Use \\n for line breaks."),
  shape: z
    .enum(["rectangle", "ellipse", "diamond"])
    .optional()
    .describe(
      "rectangle (default) for steps, ellipse for start/end or data, diamond for decisions",
    ),
  color: z
    .enum(["default", "red", "green", "blue", "yellow", "violet", "orange"])
    .optional()
    .describe("Accent color; default is black on transparent"),
});

const edgeSchema = z.object({
  from: z.string().describe("Source node id"),
  to: z.string().describe("Target node id"),
  label: z.string().optional().describe("Optional text on the arrow"),
  style: z.enum(["solid", "dashed", "dotted"]).optional(),
});

server.registerTool(
  "create_diagram",
  {
    title: "Create Excalidraw diagram",
    description:
      "Draw a flowchart/graph as an Obsidian Excalidraw note. Describe the diagram " +
      "as nodes and directed edges; layout, arrow binding and the Excalidraw file " +
      "format are handled automatically. Returns the vault-relative path of the " +
      "created note.",
    inputSchema: {
      name: z
        .string()
        .min(1)
        .describe('Diagram title, becomes the file name (e.g. "RSA Workflow")'),
      folder: z
        .string()
        .optional()
        .describe(
          'Vault-relative folder to save into (default: "Excalidraw", created if missing)',
        ),
      direction: z
        .enum(["down", "right"])
        .optional()
        .describe("Main flow direction of the layout (default: down)"),
      font: z
        .enum(FONTS)
        .optional()
        .describe(
          "Label font: normal (clean sans-serif, default), hand-drawn (Excalidraw's sketchy look), or code (monospace)",
        ),
      nodes: z.array(nodeSchema).min(1),
      edges: z.array(edgeSchema).optional(),
    },
  },
  async ({ name, folder, direction, font, nodes, edges }) => {
    try {
      const vault = resolveVaultPath();
      const spec: DiagramSpec = {
        nodes,
        edges: edges ?? [],
        direction,
        font: font ?? defaultFont(),
      };
      const built = buildDiagram(spec);
      const markdown = toExcalidrawMarkdown(built);
      const relPath = await writeDiagram(
        vault,
        folder ?? process.env.EXCALIDRAW_FOLDER ?? "Excalidraw",
        name,
        markdown,
      );
      return {
        content: [
          {
            type: "text",
            text:
              `Created "${relPath}" (${nodes.length} nodes, ` +
              `${spec.edges.length} edges). Open it in Obsidian's Excalidraw view.`,
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Failed to create diagram: ${(err as Error).message}` },
        ],
      };
    }
  },
);

if (process.argv[2] === "setup") {
  const { runSetup } = await import("./setup.js");
  await runSetup();
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
