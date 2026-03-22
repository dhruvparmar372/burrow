import { join } from "path";
import { homedir } from "os";
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

export function getDataDir(): string {
  return join(homedir(), ".scaletails");
}

export function getNodesDir(): string {
  return join(getDataDir(), "nodes");
}

export function loadConfig(): ScaleTailsConfig | null {
  const dir = getDataDir();
  const configPath = join(dir, CONFIG_FILE);
  if (!existsSync(configPath)) return null;
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as ScaleTailsConfig;
}

export function saveConfig(config: ScaleTailsConfig): void {
  const dir = getDataDir();
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
