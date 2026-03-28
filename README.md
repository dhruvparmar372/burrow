# Burrow

Self-hosted VPN in one command. Deploy Tailscale exit nodes to AWS, Hetzner Cloud, or Google Cloud. Your cloud, your traffic.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/dhruvparmar372/burrow/main/install.sh | sh
```

This installs the `burrow` binary and sets up [Terraform](https://developer.hashicorp.com/terraform/install) and [Tailscale](https://tailscale.com/) if not already present.

## Usage

```bash
# Set up credentials
burrow init

# Deploy exit nodes (AWS is the default provider)
burrow add --region us-east-1
burrow add --region eu-west-1

# Deploy to other providers
burrow add --provider hetzner --region fsn1
burrow add --provider gcp --region us-central1-a

# List active nodes
burrow list

# View config (values are redacted)
burrow config

# Remove a node
burrow remove --region us-east-1
burrow remove --provider hetzner --region fsn1

# Remove all nodes
burrow remove --all
```

## Commands

| Command | Description |
|---------|-------------|
| `burrow init` | Set up Tailscale auth key |
| `burrow config` | View current config (redacted) or update via flags |
| `burrow add --region <region>` | Deploy an exit node (prompts for provider credentials if needed) |
| `burrow add --provider <name> --region <region>` | Deploy to a specific provider (aws, hetzner, gcp) |
| `burrow list` | List all active exit nodes |
| `burrow remove --region <region>` | Tear down an exit node |
| `burrow remove --all` | Remove all exit nodes |

All commands support `--json` for structured output and `--auto-approve` to skip confirmations.

---

## Development

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [Terraform](https://developer.hashicorp.com/terraform/install) CLI

### Setup

```bash
cd package
bun install
```

### Running locally

```bash
# Run the CLI directly
bun run dev -- init
bun run dev -- add --region us-east-1

# Build a standalone binary
bun run build
```

### Testing

```bash
cd package
bun test
```

### Project structure

```
burrow/
├── package/                 # CLI source
│   ├── src/
│   │   ├── index.ts         # Entry point, registers commands
│   │   ├── config.ts        # Config load/save (~/.burrow/config.json)
│   │   ├── manifest.ts      # Node manifest (tracks deployed nodes)
│   │   ├── terraform.ts     # Terraform runner + generic utilities
│   │   ├── utils.ts         # Shared utilities
│   │   ├── providers/
│   │   │   ├── types.ts     # Provider interface
│   │   │   ├── registry.ts  # Provider registry (map + lookup)
│   │   │   ├── index.ts     # Re-exports, triggers registration
│   │   │   ├── aws.ts       # AWS provider (EC2 + SSM)
│   │   │   ├── hetzner.ts   # Hetzner Cloud provider
│   │   │   └── gcp.ts       # GCP provider (Compute Engine)
│   │   └── commands/
│   │       ├── init.ts      # Tailscale auth key setup
│   │       ├── config.ts    # View/update config
│   │       ├── add.ts       # Deploy an exit node
│   │       ├── list.ts      # List active nodes
│   │       └── remove.ts    # Tear down nodes
│   └── tests/
├── website/                 # Astro landing page
├── install.sh               # curl installer script
└── .github/workflows/
    └── release.yml          # Build binaries on tag push
```

### Architecture

Burrow is a CLI that wraps Terraform to manage Tailscale exit nodes across multiple cloud providers. The key design decisions:

- **Provider interface** — Each cloud provider (AWS, Hetzner, GCP) implements a common `Provider` interface. A registry maps provider names to implementations, so commands dispatch generically instead of with hardcoded provider checks.
- **Embedded Terraform** — HCL templates are generated per-provider, not stored as external files. This makes the CLI fully self-contained.
- **Inline credential prompting** — When `burrow add` is called for an unconfigured provider, it prompts for credentials inline and saves them, so `burrow init` only handles Tailscale setup.
- **State in `~/.burrow/`** — config, manifests, and per-node Terraform state all live under the user's home directory.
- **Standalone binary** — `bun build --compile` produces a single executable with no runtime dependencies.

### Release process

Push a version tag to trigger the release workflow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This builds binaries for macOS (ARM64, x64) and Linux (x64, ARM64), then creates a GitHub Release with all artifacts attached.
