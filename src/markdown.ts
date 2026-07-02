import type { BuiltDiagram } from "./diagram.js";

/**
 * Wraps a scene in the markdown format the obsidian-excalidraw-plugin
 * expects (`excalidraw-plugin: parsed`, uncompressed JSON block). Text
 * element ids double as block references so the vault can link to them.
 */
export function toExcalidrawMarkdown(built: BuiltDiagram): string {
  const textSection = built.textElements
    .map((t) => `${t.text} ^${t.id}`)
    .join("\n\n");

  const json = JSON.stringify(built.scene, null, "\t");

  return `---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==


# Excalidraw Data

## Text Elements
${textSection}

%%
## Drawing
\`\`\`json
${json}
\`\`\`
%%`;
}
