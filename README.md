# ScaleTails

Deploy Tailscale exit nodes across cloud providers.

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [Terraform](https://developer.hashicorp.com/terraform/install) CLI
- A [Tailscale](https://tailscale.com/) account with an auth key
- An AWS account (access key ID + secret access key)

## Setup

```bash
cd cli && bun install
```

## Usage

### Configure credentials

Interactive:
```bash
bun run cli/src/index.ts config
```

Non-interactive:
```bash
bun run cli/src/index.ts config \
  --tailscale-auth-key tskey-auth-xxx \
  --aws-access-key-id AKIA... \
  --aws-secret-access-key ... \
  --json
```

Or import from a file:
```bash
bun run cli/src/index.ts config --from-file config.json --json
```

### Deploy an exit node

```bash
bun run cli/src/index.ts add --region ap-south-1
bun run cli/src/index.ts add --region me-central-1
```

### List active nodes

```bash
bun run cli/src/index.ts list
```

### Remove an exit node

```bash
bun run cli/src/index.ts remove --region ap-south-1
```

### Remove all exit nodes

```bash
bun run cli/src/index.ts remove --all
```

## Supported Regions

| Provider | Region | Location |
|----------|--------|----------|
| AWS | `ap-south-1` | Mumbai |
| AWS | `me-central-1` | UAE |

## Agent-Friendly Usage

All commands support `--json` for structured output and `--auto-approve` to skip confirmations:

```bash
bun run cli/src/index.ts add --region ap-south-1 --auto-approve --json
bun run cli/src/index.ts list --json
bun run cli/src/index.ts remove --region ap-south-1 --auto-approve --json
```
