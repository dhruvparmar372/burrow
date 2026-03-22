import { join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { getNodesDir } from "./config";
import type { AwsProviderConfig } from "./config";

// Supported regions per provider — must match the AMI map in the Terraform module
const SUPPORTED_REGIONS: Record<string, string[]> = {
  aws: ["ap-south-1", "me-central-1"],
};

export function getSupportedRegions(provider: string): string[] {
  return SUPPORTED_REGIONS[provider] ?? [];
}

export function generateAwsRootConfig(region: string): string {
  return `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.41"
    }
  }
}

provider "aws" {
  region = "${region}"
}

module "exit_node" {
  source = "../../modules/aws-exit-node"

  aws_region         = "${region}"
  tailscale_auth_key = var.tailscale_auth_key
}

variable "tailscale_auth_key" {
  type      = string
  sensitive = true
}
`;
}

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

export function writeRootConfig(nodeDir: string, hcl: string): void {
  writeFileSync(join(nodeDir, "main.tf"), hcl);
}

export function cleanupNodeDirectory(nodeDir: string): void {
  rmSync(nodeDir, { recursive: true, force: true });
}

export function buildAwsEnvVars(awsConfig: AwsProviderConfig): Record<string, string> {
  if (awsConfig.useAmbientCredentials) return {};
  return {
    AWS_ACCESS_KEY_ID: awsConfig.accessKeyId,
    AWS_SECRET_ACCESS_KEY: awsConfig.secretAccessKey,
  };
}
