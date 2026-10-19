import { ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import * as vscode from "vscode";

// Events and requests of the agent's --stdio protocol (see src/server.ts in the agent).
export type AgentEvent = { type: string; [key: string]: unknown };
export type AgentRequest =
  | { type: "prompt"; text: string; context?: string }
  | { type: "command"; text: string }
  | { type: "approval"; requestId: number; decision: "yes" | "always" | "no" }
  | { type: "interrupt" };

interface Launch {
  command: string;
  env: NodeJS.ProcessEnv;
}

let cachedShellLaunch: Promise<Launch | undefined> | undefined;

function onPath(name: string, envPath = process.env.PATH ?? ""): string | undefined {
  const exts = process.platform === "win32" ? ["", ".cmd", ".exe"] : [""];
  for (const dir of envPath.split(path.delimiter)) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

// VS Code's environment often lacks what a login shell sets up (nvm, npm prefix),
// so fall back to asking the user's shell where the command lives.
function resolveViaShell(name: string): Promise<Launch | undefined> {
  if (process.platform === "win32") return Promise.resolve(undefined);
  const shell = process.env.SHELL || "/bin/bash";
  const script = `printf '__ANTAEUS__%s__%s__END__' "$(command -v ${name})" "$PATH"`;

  return new Promise((resolve) => {
    execFile(shell, ["-ilc", script], { timeout: 10_000 }, (_error, stdout) => {
      const match = /__ANTAEUS__(.*?)__(.*?)__END__/s.exec(stdout ?? "");
      if (!match || !match[1]) return resolve(undefined);
      resolve({ command: match[1], env: { ...process.env, PATH: match[2] } });
    });
  });
}

async function resolveLaunch(configured: string): Promise<Launch> {
  if (path.isAbsolute(configured) || configured.includes("/")) {
    return { command: configured, env: process.env };
  }

  const direct = onPath(configured);
  // The bin is a `#!/usr/bin/env node` script, so node must be reachable too
  if (direct && (process.platform === "win32" || onPath("node"))) {
    return { command: direct, env: process.env };
  }

  cachedShellLaunch ??= resolveViaShell(configured);
  const viaShell = await cachedShellLaunch;
  if (viaShell) return viaShell;
  cachedShellLaunch = undefined;

  throw new Error(
    `Could not find "${configured}". Run \`npm link\` in the agent's repository, ` +
      `or set "antaeus.command" to the full path of bin/antaeus.js.`,
  );
}

export class AgentProcess implements vscode.Disposable {
  private child: ChildProcessWithoutNullStreams | undefined;
  private disposed = false;

  constructor(
    private readonly cwd: string,
    private readonly output: vscode.OutputChannel,
    private readonly onEvent: (event: AgentEvent) => void,
    private readonly onExit: (message: string) => void,
  ) {}

  async start(): Promise<void> {
    const config = vscode.workspace.getConfiguration("antaeus");
    const args = [...config.get<string[]>("args", []), "--stdio"];

    let launch: Launch;
    try {
      launch = await resolveLaunch(config.get<string>("command", "antaeus"));
    } catch (error) {
      this.onExit(error instanceof Error ? error.message : String(error));
      return;
    }
    if (this.disposed) return;

    this.output.appendLine(`[antaeus] ${launch.command} ${args.join(" ")}  (cwd: ${this.cwd})`);

    const child = spawn(launch.command, args, {
      cwd: this.cwd,
      env: launch.env,
      shell: process.platform === "win32",
    });
    this.child = child;

    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      if (!line.trim()) return;
      try {
        this.onEvent(JSON.parse(line) as AgentEvent);
      } catch {
        this.output.appendLine(`[stdout] ${line}`);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => this.output.append(chunk.toString()));

    child.on("error", (error) => {
      this.child = undefined;
      if (!this.disposed) this.onExit(`Failed to start the agent: ${error.message}`);
    });

    child.on("exit", (code, signal) => {
      if (this.child !== child) return;
      this.child = undefined;
      if (!this.disposed) {
        this.onExit(`The agent stopped (${signal ?? `exit code ${code}`}). See the "Antaeus" output for details.`);
      }
    });
  }

  get running(): boolean {
    return this.child !== undefined;
  }

  send(request: AgentRequest): void {
    this.child?.stdin.write(JSON.stringify(request) + "\n");
  }

  dispose(): void {
    this.disposed = true;
    const child = this.child;
    this.child = undefined;
    if (child) {
      child.stdin.end();
      setTimeout(() => child.kill(), 1000);
    }
  }
}
