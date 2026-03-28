import { input, password } from "@inquirer/prompts";
import type { Provider } from "./types";
import { registerProvider } from "./registry";

function redact(value: string): string {
  if (!value || value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

function generateMainTf(region: string): string {
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

variable "aws_instance_type" {
  type    = string
  default = "t3.nano"
}

data "aws_ssm_parameter" "ubuntu_ami" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
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
  ami                         = data.aws_ssm_parameter.ubuntu_ami.value
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

const USER_DATA_TFTPL = `#!/bin/bash

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

const awsProvider: Provider = {
  name: "aws",
  displayName: "AWS",

  generateTerraformFiles(region: string): Record<string, string> {
    return {
      "main.tf": generateMainTf(region),
      "user_data.tftpl": USER_DATA_TFTPL,
    };
  },

  buildEnvVars(config: Record<string, string>): Record<string, string> {
    return {
      AWS_ACCESS_KEY_ID: config.accessKeyId,
      AWS_SECRET_ACCESS_KEY: config.secretAccessKey,
    };
  },

  buildTerraformVars(_config: Record<string, string>): Record<string, string> {
    return {};
  },

  async promptForCredentials(existing?: Record<string, string>): Promise<Record<string, string>> {
    const accessKeyId = await input({
      message: "AWS Access Key ID:",
      default: existing?.accessKeyId || undefined,
    });
    const secretAccessKey = await password({
      message: "AWS Secret Access Key:",
      mask: "*",
      default: existing?.secretAccessKey || undefined,
    });
    return { accessKeyId, secretAccessKey };
  },

  validateConfig(config: Record<string, string>): string[] {
    const errors: string[] = [];
    if (!config.accessKeyId) errors.push("AWS Access Key ID is required.");
    if (!config.secretAccessKey) errors.push("AWS Secret Access Key is required.");
    return errors;
  },

  redactConfig(config: Record<string, string>): Record<string, string> {
    return {
      accessKeyId: redact(config.accessKeyId ?? ""),
      secretAccessKey: redact(config.secretAccessKey ?? ""),
    };
  },
};

registerProvider(awsProvider);
