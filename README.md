# Burrow

Self-hosted VPN in one command. Deploy Tailscale exit nodes to any AWS region. Your cloud, your traffic.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/dhruvparmar372/burrow/main/install.sh | sh
```

This installs the `burrow` binary and sets up [Terraform](https://developer.hashicorp.com/terraform/install) and [Tailscale](https://tailscale.com/) if not already present.

## Usage

```bash
# Set up credentials
burrow init

# Deploy exit nodes
burrow add --region us-east-1
burrow add --region eu-west-1

# List active nodes
burrow list

# View config (values are redacted)
burrow config

# Remove a node
burrow remove --region us-east-1

# Remove all nodes
burrow remove --all
```

## Commands

| Command | Description |
|---------|-------------|
| `burrow init` | Interactive setup wizard for credentials |
| `burrow config` | View current config (redacted) or update via flags |
| `burrow add --region <region>` | Deploy an exit node to any AWS region |
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
│   │   ├── terraform.ts     # Embedded Terraform templates + runner
│   │   ├── utils.ts         # Shared utilities
│   │   └── commands/
│   │       ├── init.ts      # Interactive first-time setup
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

Burrow is a CLI that wraps Terraform to manage Tailscale exit nodes on AWS. The key design decisions:

- **Embedded Terraform** — HCL templates are generated in `terraform.ts`, not stored as external files. This makes the CLI fully self-contained.
- **Runtime AMI lookup** — Ubuntu AMIs are resolved at apply time via AWS SSM Parameter Store, so any AWS region works without a hardcoded AMI map.
- **State in `~/.burrow/`** — config, manifests, and per-node Terraform state all live under the user's home directory.
- **Standalone binary** — `bun build --compile` produces a single executable with no runtime dependencies.

### Release process

Push a version tag to trigger the release workflow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This builds binaries for macOS (ARM64, x64) and Linux (x64, ARM64), then creates a GitHub Release with all artifacts attached.
