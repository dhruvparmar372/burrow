import { password } from "@inquirer/prompts";
import type { Provider } from "./types";
import { registerProvider } from "./registry";

function redact(value: string): string {
  if (!value || value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

function generateMainTf(location: string): string {
  return `terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

variable "hcloud_token" {
  type      = string
  sensitive = true
}

variable "tailscale_auth_key" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.tailscale_auth_key) > 0
    error_message = "Tailscale Auth Key is required."
  }
}

variable "server_type" {
  type    = string
  default = "cx22"
}

resource "hcloud_server" "ts_exit_node" {
  name        = "ts-exit-node-${location}"
  image       = "ubuntu-24.04"
  server_type = var.server_type
  location    = "${location}"

  user_data = <<-EOF
    #!/bin/bash

    # enable ip forwarding
    echo 'net.ipv4.ip_forward = 1' | tee -a /etc/sysctl.conf
    echo 'net.ipv6.conf.all.forwarding = 1' | tee -a /etc/sysctl.conf
    sysctl -p /etc/sysctl.conf

    # install tailscale
    curl -fsSL https://tailscale.com/install.sh | sh
    tailscale up --authkey \${var.tailscale_auth_key} --advertise-exit-node --advertise-tags=tag:scaletails --hostname=TSExitNode-${location}
  EOF

  labels = {
    managed_by = "burrow"
  }
}

output "server_id" {
  value = hcloud_server.ts_exit_node.id
}

output "public_ip" {
  value = hcloud_server.ts_exit_node.ipv4_address
}
`;
}

const hetznerProvider: Provider = {
  name: "hetzner",
  displayName: "Hetzner Cloud",

  generateTerraformFiles(region: string): Record<string, string> {
    return {
      "main.tf": generateMainTf(region),
    };
  },

  buildEnvVars(config: Record<string, string>): Record<string, string> {
    return {
      HCLOUD_TOKEN: config.apiToken,
    };
  },

  buildTerraformVars(config: Record<string, string>): Record<string, string> {
    return {
      hcloud_token: config.apiToken,
    };
  },

  async promptForCredentials(existing?: Record<string, string>): Promise<Record<string, string>> {
    const apiToken = await password({
      message: "Hetzner Cloud API Token:",
      mask: "*",
      default: existing?.apiToken || undefined,
    });
    return { apiToken };
  },

  validateConfig(config: Record<string, string>): string[] {
    const errors: string[] = [];
    if (!config.apiToken) errors.push("Hetzner Cloud API Token is required.");
    return errors;
  },

  redactConfig(config: Record<string, string>): Record<string, string> {
    return {
      apiToken: redact(config.apiToken ?? ""),
    };
  },
};

registerProvider(hetznerProvider);
