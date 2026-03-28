import { join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { getNodesDir } from "./config";

// ---------------------------------------------------------------------------
// Public API — generic Terraform utilities
// ---------------------------------------------------------------------------

export function checkTerraformInstalled(): boolean {
  try {
    const result = Bun.spawnSync(["terraform", "--version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

interface TerraformRunOptions {
  command: "init" | "apply" | "destroy" | "show";
  cwd: string;
  autoApprove?: boolean;
  vars?: Record<string, string>;
  envVars?: Record<string, string>;
  jsonMode?: boolean;
}

export async function runTerraform(options: TerraformRunOptions): Promise<number> {
  const args = ["terraform", options.command];

  if (options.autoApprove && (options.command === "apply" || options.command === "destroy")) {
    args.push("-auto-approve");
  }

  if (options.vars) {
    for (const [key, value] of Object.entries(options.vars)) {
      args.push("-var", `${key}=${value}`);
    }
  }

  const env = { ...process.env, ...options.envVars } as Record<string, string>;

  // In JSON mode, redirect Terraform's stdout to stderr so agents can
  // parse structured JSON from the CLI's stdout separately.
  const proc = Bun.spawn(args, {
    cwd: options.cwd,
    env,
    stdin: "inherit",
    stdout: options.jsonMode ? "pipe" : "inherit",
    stderr: "inherit",
  });

  // Pipe Terraform stdout to stderr in JSON mode
  if (options.jsonMode && proc.stdout) {
    const reader = proc.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        process.stderr.write(value);
      }
    } catch {
      // Stream ended
    }
  }

  await proc.exited;
  return proc.exitCode ?? 1;
}

export function createNodeDirectory(provider: string, region: string, nodesDir?: string): string {
  const dir = nodesDir ?? getNodesDir();
  const nodeDir = join(dir, `${provider}-${region}`);
  mkdirSync(nodeDir, { recursive: true });
  return nodeDir;
}

export function writeTerraformFiles(nodeDir: string, files: Record<string, string>): void {
  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(nodeDir, filename), content);
  }
}

export function cleanupNodeDirectory(nodeDir: string): void {
  rmSync(nodeDir, { recursive: true, force: true });
}
