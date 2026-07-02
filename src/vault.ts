import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/** Vault root from --vault=<path> or EXCALIDRAW_VAULT_PATH / OBSIDIAN_VAULT_PATH. */
export function resolveVaultPath(argv: string[] = process.argv): string {
  const arg = argv.find((a) => a.startsWith("--vault="));
  const fromArg = arg?.slice("--vault=".length);
  const vault =
    fromArg ??
    process.env.EXCALIDRAW_VAULT_PATH ??
    process.env.OBSIDIAN_VAULT_PATH;
  if (!vault) {
    throw new Error(
      "No vault configured. Pass --vault=<path> or set EXCALIDRAW_VAULT_PATH.",
    );
  }
  if (!existsSync(vault)) {
    throw new Error(`Vault path does not exist: ${vault}`);
  }
  return path.resolve(vault);
}

/** Strip characters Obsidian forbids in note names. */
export function sanitizeName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|#^[\]]/g, "").trim();
  if (!cleaned) throw new Error(`Diagram name "${name}" is empty after sanitizing.`);
  return cleaned;
}

/**
 * Writes a diagram into the vault, never overwriting: an existing name
 * gets a " 2", " 3", ... suffix. Returns the vault-relative path.
 */
export async function writeDiagram(
  vault: string,
  folder: string,
  name: string,
  content: string,
): Promise<string> {
  if (folder.split(/[\\/]/).includes("..")) {
    throw new Error(`Folder must stay inside the vault: "${folder}"`);
  }
  const dir = path.join(vault, folder);
  await mkdir(dir, { recursive: true });

  const base = sanitizeName(name);
  let file = path.join(dir, `${base}.excalidraw.md`);
  for (let i = 2; existsSync(file); i++) {
    file = path.join(dir, `${base} ${i}.excalidraw.md`);
  }
  await writeFile(file, content, "utf8");
  return path.relative(vault, file).replaceAll("\\", "/");
}
