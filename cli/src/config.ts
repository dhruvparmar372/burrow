import { join, resolve } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

export interface AwsProviderConfig {
  accessKeyId: string;
  secretAccessKey: string;
  useAmbientCredentials: boolean;
}

export interface ScaleTailsConfig {
  tailscale: {
    authKey: string;
  };
  providers: {
    aws?: AwsProviderConfig;
  };
}

const CONFIG_FILE = "config.json";

export function getNodesDir(): string {
  return join(resolveProjectRoot(), "nodes");
}

/**
 * Find the project root by looking for the modules/ directory,
 * walking up from cwd. This works regardless of how the CLI is invoked
 * (bun run, bunx, bun link, etc.)
 */
export function resolveProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== "/") {
    if (existsSync(join(dir, "modules"))) return dir;
    dir = resolve(dir, "..");
  }
  // Fallback to cwd if no marker found
  return process.cwd();
}

export function loadConfig(nodesDir?: string): ScaleTailsConfig | null {
  const dir = nodesDir ?? getNodesDir();
  const configPath = join(dir, CONFIG_FILE);
  if (!existsSync(configPath)) return null;
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as ScaleTailsConfig;
}

export function saveConfig(config: ScaleTailsConfig, nodesDir?: string): void {
  const dir = nodesDir ?? getNodesDir();
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, CONFIG_FILE);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

export function validateConfig(config: ScaleTailsConfig): string[] {
  const errors: string[] = [];

  if (!config.tailscale?.authKey) {
    errors.push("Tailscale auth key is required.");
  }

  const aws = config.providers?.aws;
  if (aws && !aws.useAmbientCredentials) {
    if (!aws.accessKeyId) {
      errors.push("AWS Access Key ID is required when not using ambient credentials.");
    }
    if (!aws.secretAccessKey) {
      errors.push("AWS Secret Access Key is required when not using ambient credentials.");
    }
  }

  return errors;
}
