import { join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

export interface BurrowConfig {
  tailscale: {
    authKey: string;
  };
  providers: {
    [providerName: string]: Record<string, string>;
  };
}

const CONFIG_FILE = "config.json";

export function getDataDir(): string {
  return join(homedir(), ".burrow");
}

export function getNodesDir(): string {
  return join(getDataDir(), "nodes");
}

export function loadConfig(dir?: string): BurrowConfig | null {
  const dataDir = dir ?? getDataDir();
  const configPath = join(dataDir, CONFIG_FILE);
  if (!existsSync(configPath)) return null;
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as BurrowConfig;
}

export function saveConfig(config: BurrowConfig, dir?: string): void {
  const dataDir = dir ?? getDataDir();
  mkdirSync(dataDir, { recursive: true });
  const configPath = join(dataDir, CONFIG_FILE);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

export function validateConfig(config: BurrowConfig): string[] {
  const errors: string[] = [];

  if (!config.tailscale?.authKey) {
    errors.push("Tailscale auth key is required.");
  }

  // Provider-specific validation is delegated to each provider's validateConfig()
  // This function only validates the top-level structure

  return errors;
}
