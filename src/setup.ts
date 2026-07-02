import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { buildDiagram } from "./diagram.js";
import { toExcalidrawMarkdown } from "./markdown.js";
import { writeDiagram } from "./vault.js";

// npm package name; clients re-resolve the server through npx with this.
const PACKAGE = "excalidraw-skills";
const SERVER_NAME = "excalidraw";

interface Invocation {
  command: string;
  args: string[];
}

function appDataDir(app: string): string {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"),
      app,
    );
  }
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", app);
  }
  return path.join(homedir(), ".config", app);
}

/** Vault paths from Obsidian's own registry, so nobody has to type one. */
function knownVaults(): string[] {
  try {
    const raw = readFileSync(
      path.join(appDataDir("obsidian"), "obsidian.json"),
      "utf8",
    );
    const cfg = JSON.parse(raw) as { vaults?: Record<string, { path?: string }> };
    return Object.values(cfg.vaults ?? {})
      .map((v) => v.path)
      .filter((p): p is string => typeof p === "string" && existsSync(p));
  } catch {
    return [];
  }
}

/**
 * How a client should start the server. A clone can point at its own
 * dist/index.js; an npx run lives in a prunable cache, so clients must
 * re-resolve through npx instead.
 */
function serverInvocation(): Invocation {
  const self = fileURLToPath(import.meta.url);
  if (self.split(path.sep).includes("_npx")) {
    return { command: "npx", args: ["-y", PACKAGE] };
  }
  return { command: "node", args: [path.join(path.dirname(self), "index.js")] };
}

const quote = (s: string): string =>
  /[\s"']/.test(s) ? `"${s.replaceAll('"', '\\"')}"` : s;

function run(cmd: string[], stdio: "inherit" | "ignore" = "inherit"): boolean {
  return spawnSync(cmd.map(quote).join(" "), { shell: true, stdio }).status === 0;
}

function hasClaudeCli(): boolean {
  return spawnSync("claude --version", { shell: true, stdio: "ignore" }).status === 0;
}

function registerClaudeCode(inv: Invocation, vault: string): boolean {
  // Replace any existing registration so re-running setup is idempotent.
  if (run(["claude", "mcp", "get", SERVER_NAME], "ignore")) {
    run(["claude", "mcp", "remove", SERVER_NAME, "--scope", "user"], "ignore");
  }
  return run([
    "claude", "mcp", "add", SERVER_NAME, "--scope", "user",
    "-e", `EXCALIDRAW_VAULT_PATH=${vault}`, "--",
    inv.command, ...inv.args,
  ]);
}

function desktopConfigFile(): string {
  return path.join(appDataDir("Claude"), "claude_desktop_config.json");
}

function patchDesktopConfig(file: string, inv: Invocation, vault: string): boolean {
  let cfg: Record<string, unknown> = {};
  const raw = readFileSync(file, "utf8");
  if (raw.trim().length > 0) {
    try {
      cfg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.log(`  ${file} is not valid JSON; leaving it untouched.`);
      return false;
    }
  }
  copyFileSync(file, `${file}.bak`);
  const servers = (cfg.mcpServers ??= {}) as Record<string, unknown>;
  servers[SERVER_NAME] = {
    command: inv.command,
    args: inv.args,
    env: { EXCALIDRAW_VAULT_PATH: vault },
  };
  writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  console.log(`  Updated ${file}`);
  console.log(`  (backup saved as ${path.basename(file)}.bak)`);
  return true;
}

function printSnippet(inv: Invocation, vault: string): void {
  console.log("\nAdd this to your MCP client's configuration by hand:");
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          [SERVER_NAME]: {
            command: inv.command,
            args: inv.args,
            env: { EXCALIDRAW_VAULT_PATH: vault },
          },
        },
      },
      null,
      2,
    ),
  );
}

/**
 * Line-by-line prompt that also works with piped answers: lines arriving
 * before their question is asked are buffered instead of dropped (plain
 * readline.question loses them). On EOF, unanswered prompts get "n" so a
 * truncated pipe can never register or write anything by accident.
 */
function lineReader() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY === true,
  });
  const buffered: string[] = [];
  const waiters: Array<(line: string) => void> = [];
  let closed = false;
  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else buffered.push(line);
  });
  rl.on("close", () => {
    closed = true;
    while (waiters.length > 0) waiters.shift()!("n");
  });
  return {
    question(prompt: string): Promise<string> {
      process.stdout.write(prompt);
      const line = buffered.shift();
      if (line !== undefined) return Promise.resolve(line);
      if (closed) return Promise.resolve("n");
      return new Promise((resolve) => waiters.push(resolve));
    },
    close(): void {
      rl.close();
    },
  };
}

export async function runSetup(): Promise<void> {
  const rl = lineReader();
  const yes = async (q: string): Promise<boolean> =>
    !(await rl.question(`${q} [Y/n] `)).trim().toLowerCase().startsWith("n");

  try {
    console.log("excalidraw-skills setup");
    console.log("=======================");

    const vaults = knownVaults();
    let vault: string;
    if (vaults.length > 0) {
      console.log("\nObsidian vaults on this machine:");
      vaults.forEach((v, i) => console.log(`  ${i + 1}) ${v}`));
      const answer = (
        await rl.question(`\nPick a vault [1-${vaults.length}], or type a path: `)
      ).trim();
      const pick = Number(answer);
      vault =
        Number.isInteger(pick) && pick >= 1 && pick <= vaults.length
          ? vaults[pick - 1]
          : answer;
    } else {
      vault = (
        await rl.question("\nNo Obsidian config found. Path to your vault: ")
      ).trim();
    }
    vault = path.resolve(vault);
    if (!existsSync(vault)) {
      throw new Error(`Vault path does not exist: ${vault}`);
    }
    console.log(`Using vault: ${vault}`);

    const plugin = path.join(
      vault,
      ".obsidian",
      "plugins",
      "obsidian-excalidraw-plugin",
    );
    if (!existsSync(plugin)) {
      console.log("\nNote: the Excalidraw community plugin is not installed in");
      console.log("this vault. Diagrams will open as raw markdown until you add");
      console.log('it (Obsidian -> Settings -> Community plugins -> "Excalidraw").');
    }

    const inv = serverInvocation();
    let registered = false;

    if (hasClaudeCli()) {
      if (await yes("\nRegister with Claude Code (user scope)?")) {
        registered = registerClaudeCode(inv, vault);
        console.log(
          registered
            ? "  Registered with Claude Code."
            : "  claude mcp add failed; see output above.",
        );
      }
    } else {
      console.log("\nClaude Code CLI not found on PATH; skipping.");
    }

    const desktop = desktopConfigFile();
    if (existsSync(desktop)) {
      if (await yes("Add to Claude Desktop's config?")) {
        registered = patchDesktopConfig(desktop, inv, vault) || registered;
      }
    }

    if (!registered) printSnippet(inv, vault);

    if (await yes("\nWrite a test diagram into the vault now?")) {
      const built = buildDiagram({
        nodes: [
          { id: "setup", label: "Setup wizard" },
          { id: "server", label: "excalidraw-skills\nMCP server", color: "blue" },
          { id: "vault", label: "It works!", shape: "ellipse", color: "green" },
        ],
        edges: [
          { from: "setup", to: "server", label: "registers" },
          { from: "server", to: "vault", label: "draws into" },
        ],
      });
      const rel = await writeDiagram(
        vault,
        process.env.EXCALIDRAW_FOLDER ?? "Excalidraw",
        "Excalidraw MCP Setup Test",
        toExcalidrawMarkdown(built),
      );
      console.log(`  Created "${rel}" - open it in Obsidian to verify.`);
    }

    console.log("\nDone. Restart Claude Code / Claude Desktop to pick up the server,");
    console.log('then try: "Draw me on excalidraw a workflow of RSA encryption".');
  } finally {
    rl.close();
  }
}
