import { input, password } from "@inquirer/prompts";
import type { Provider } from "./types";
import { registerProvider } from "./registry";

function generateMainTf(zone: string): string {
  const region = zone.replace(/-[a-z]$/, "");
  return `terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = "${region}"
  zone    = "${zone}"
}

variable "gcp_project_id" {
  type = string
}

variable "tailscale_auth_key" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.tailscale_auth_key) > 0
    error_message = "Tailscale Auth Key is required."
  }
}

variable "machine_type" {
  type    = string
  default = "e2-micro"
}

resource "google_compute_instance" "ts_exit_node" {
  name         = "ts-exit-node-${zone}"
  machine_type = var.machine_type
  zone         = "${zone}"

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
    }
  }

  network_interface {
    network = "default"
    access_config {}
  }

  metadata_startup_script = <<-EOF
    #!/bin/bash

    # enable ip forwarding
    echo 'net.ipv4.ip_forward = 1' | tee -a /etc/sysctl.conf
    echo 'net.ipv6.conf.all.forwarding = 1' | tee -a /etc/sysctl.conf
    sysctl -p /etc/sysctl.conf

    # install tailscale
    curl -fsSL https://tailscale.com/install.sh | sh
    tailscale up --authkey \${var.tailscale_auth_key} --advertise-exit-node --advertise-tags=tag:scaletails --hostname=TSExitNode-${zone}
  EOF

  labels = {
    managed_by = "burrow"
  }

  tags = ["tailscale-exit-node"]
}

resource "google_compute_firewall" "allow_tailscale" {
  name    = "allow-tailscale-${zone}"
  network = "default"

  allow {
    protocol = "udp"
    ports    = ["41641"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["tailscale-exit-node"]
}

output "instance_id" {
  value = google_compute_instance.ts_exit_node.instance_id
}

output "public_ip" {
  value = google_compute_instance.ts_exit_node.network_interface[0].access_config[0].nat_ip
}
`;
}

const gcpProvider: Provider = {
  name: "gcp",
  displayName: "Google Cloud",

  generateTerraformFiles(region: string): Record<string, string> {
    return {
      "main.tf": generateMainTf(region),
    };
  },

  buildEnvVars(config: Record<string, string>): Record<string, string> {
    return {
      GOOGLE_CREDENTIALS: config.credentialsJson,
    };
  },

  buildTerraformVars(config: Record<string, string>): Record<string, string> {
    return {
      gcp_project_id: config.projectId,
    };
  },

  async promptForCredentials(existing?: Record<string, string>): Promise<Record<string, string>> {
    const projectId = await input({
      message: "GCP Project ID:",
      default: existing?.projectId || undefined,
    });
    const credentialsJson = await password({
      message: "GCP Service Account JSON (paste full JSON):",
      mask: "*",
      default: existing?.credentialsJson || undefined,
    });
    return { projectId, credentialsJson };
  },

  validateConfig(config: Record<string, string>): string[] {
    const errors: string[] = [];
    if (!config.credentialsJson) errors.push("GCP Service Account JSON is required.");
    if (!config.projectId) errors.push("GCP Project ID is required.");
    return errors;
  },

  redactConfig(config: Record<string, string>): Record<string, string> {
    return {
      credentialsJson: config.credentialsJson ? "****" : "",
      projectId: config.projectId ?? "",
    };
  },
};

registerProvider(gcpProvider);
