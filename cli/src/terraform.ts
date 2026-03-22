import { join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { getNodesDir } from "./config";
import type { AwsProviderConfig } from "./config";

// Supported regions per provider — must match the AMI map in the embedded terraform
const SUPPORTED_REGIONS: Record<string, string[]> = {
  aws: ["ap-south-1", "me-central-1"],
};

export function getSupportedRegions(provider: string): string[] {
  return SUPPORTED_REGIONS[provider] ?? [];
}

// ---------------------------------------------------------------------------
// Embedded Terraform templates for AWS exit nodes
// ---------------------------------------------------------------------------
// These were previously in modules/aws-exit-node/. Embedding them makes the
// CLI fully self-contained — no external module references needed.
// ---------------------------------------------------------------------------

function generateAwsMainTf(region: string): string {
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

variable "tailscale_auth_key" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.tailscale_auth_key) > 0
    error_message = "Tailscale Auth Key is required."
  }
}

variable "aws_instance_ami_id" {
  type = map(string)
  default = {
    "ap-south-1"   = "ami-007020fd9c84e18c7"
    "me-central-1" = "ami-04c9a1a3a1cdc1655"
  }
}

variable "aws_instance_type" {
  type    = string
  default = "t3.nano"
}

resource "aws_iam_role" "ec2_ssm_role" {
  name = "ec2-ssm-role-${region}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "ec2.amazonaws.com"
        },
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_policy_attachment" {
  role       = aws_iam_role.ec2_ssm_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_ssm_instance_profile" {
  name = "ec2-ssm-instance-profile-${region}"
  role = aws_iam_role.ec2_ssm_role.name
}

resource "aws_instance" "ts_exit_node" {
  ami                         = lookup(var.aws_instance_ami_id, "${region}", "")
  instance_type               = var.aws_instance_type
  associate_public_ip_address = true

  iam_instance_profile = aws_iam_instance_profile.ec2_ssm_instance_profile.name

  metadata_options {
    http_tokens = "required"
  }

  user_data = templatefile("\${path.module}/user_data.tftpl", {
    tailscale_auth_key = var.tailscale_auth_key,
    tailscale_hostname = "TSExitNode-${region}"
  })

  tags = {
    Name = "TSExitNode-${region}"
  }
}

output "instance_id" {
  value = aws_instance.ts_exit_node.id
}

output "public_ip" {
  value = aws_instance.ts_exit_node.public_ip
}
`;
}

const AWS_USER_DATA_TFTPL = `#!/bin/bash

# install & start ssm agent on ubuntu
sudo apt-get update
sudo snap install amazon-ssm-agent --classic
sudo systemctl start snap.amazon-ssm-agent.amazon-ssm-agent.service
sudo systemctl enable snap.amazon-ssm-agent.amazon-ssm-agent.service

# enable ip forwarding
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.conf
sysctl -p /etc/sysctl.conf

# install tailscale
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey \${tailscale_auth_key} --advertise-exit-node --advertise-tags=tag:scaletails --hostname=\${tailscale_hostname}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateAwsTerraformFiles(region: string): Record<string, string> {
  return {
    "main.tf": generateAwsMainTf(region),
    "user_data.tftpl": AWS_USER_DATA_TFTPL,
  };
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

export function writeTerraformFiles(nodeDir: string, files: Record<string, string>): void {
  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(nodeDir, filename), content);
  }
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
