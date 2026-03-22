# ScaleTails CLI Design Spec

## Overview

Replace the current Makefile-based workflow with a Bun + TypeScript CLI that manages Tailscale exit nodes across cloud providers. The CLI wraps Terraform, isolating state per node so multiple exit nodes can run simultaneously across regions and (eventually) providers.

## Problem

The current setup stores Terraform state in a single local directory. Deploying to a second region overwrites the first region's state, making it impossible to run multiple exit nodes simultaneously. Additionally, credentials are managed via `.env` files and the AWS provider block hardcodes a profile name.

## Commands

### `scaletails config`

Interactive wizard that configures credentials. Stored in `nodes/config.json` (gitignored).

Flow:
1. Prompt for Tailscale Auth Key
2. Prompt to select a provider (currently only `aws`)
3. Prompt for provider-specific credentials (AWS: Access Key ID + Secret Access Key)

Running again updates existing values or adds new providers.

### `scaletails add --provider <provider> --region <region>`

Deploys a new exit node.

Steps:
1. Read `nodes/config.json`, validate provider/region combo is supported
2. Check `nodes/manifest.json` for duplicates
3. Create `nodes/<provider>-<region>/main.tf` — a generated root config that calls `../../modules/<provider>-exit-node` with appropriate variables
4. Run `terraform init` then `terraform apply` in that directory
   - AWS credentials passed as environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
   - Tailscale auth key and region passed as `-var` flags
   - All Terraform IO streamed to terminal via `Bun.spawn` with inherited stdio
5. On success, add entry to `nodes/manifest.json`
6. On failure, clean up the generated directory

Optional `--auto-approve` flag to skip Terraform's confirmation prompt.

### `scaletails list`

Reads `nodes/manifest.json` and prints a table:

```
PROVIDER  REGION        CREATED
aws       ap-south-1    2026-03-22 10:30 UTC
aws       me-central-1  2026-03-22 11:15 UTC
```

Optional `--verify` flag to run `terraform show` per node and confirm actual infrastructure state.

### `scaletails remove --provider <provider> --region <region>`

Tears down an exit node.

Steps:
1. Look up the node in `nodes/manifest.json`
2. Run `terraform destroy` in the node's directory, streaming all output
3. On success, remove entry from manifest and delete the node directory
4. On failure, leave everything in place for debugging

Optional `--auto-approve` flag.

## Project Structure

```
scaletails/
├── cli/
│   ├── src/
│   │   ├── index.ts              # Entry point, command routing
│   │   ├── commands/
│   │   │   ├── config.ts         # Interactive config wizard
│   │   │   ├── add.ts            # Deploy a node
│   │   │   ├── list.ts           # List active nodes
│   │   │   └── remove.ts         # Destroy a node
│   │   ├── terraform.ts          # Shell out to terraform, stream IO
│   │   └── manifest.ts           # Read/write manifest + config
│   ├── package.json
│   └── tsconfig.json
├── modules/
│   └── aws-exit-node/
│       ├── main.tf               # EC2 + IAM (provider block uses only region)
│       ├── variables.tf          # region, tailscale_auth_key, instance_type, ami map
│       └── user_data.tftpl       # Install tailscale, advertise exit node
├── nodes/                        # Gitignored, runtime-managed
│   ├── config.json               # Credentials (tailscale + per-provider)
│   ├── manifest.json             # Active nodes list
│   └── <provider>-<region>/      # Generated root config + state per node
│       ├── main.tf
│       └── terraform.tfstate
├── .gitignore
└── README.md
```

## Config File (`nodes/config.json`)

```json
{
  "tailscale": {
    "authKey": "tskey-auth-xxxxx"
  },
  "providers": {
    "aws": {
      "accessKeyId": "AKIA...",
      "secretAccessKey": "..."
    }
  }
}
```

## Terraform Module Changes

The existing `.tf` files move into `modules/aws-exit-node/` with one change:

- Remove `profile = "dhruv-dev"` from the `provider "aws"` block. Credentials are injected via environment variables by the CLI.

Everything else (EC2 instance, IAM role, user_data template) stays as-is.

## Terraform Runner (`terraform.ts`)

Shells out to `terraform` using `Bun.spawn` with:
- `stdin: "inherit"` — allows user to interact with Terraform prompts
- `stdout: "inherit"` — streams Terraform output in real time
- `stderr: "inherit"` — streams errors in real time

Provider credentials are passed as environment variables on the child process. Terraform variables (region, auth key) are passed as `-var` flags.

## What Gets Gitignored

The entire `nodes/` directory (contains credentials and Terraform state).

## What Gets Removed

- `Makefile` — replaced by the CLI
- `terraform/` directory — replaced by `modules/aws-exit-node/`
- `.env` and `.env.sample` — replaced by `nodes/config.json` via `scaletails config`

## Future Provider Support

Adding a new provider (e.g., GCP) requires:
1. A new Terraform module in `modules/gcp-exit-node/`
2. A new entry in the `config` wizard for GCP-specific credentials
3. The CLI's `add` command already handles arbitrary providers via the `--provider` flag and module path convention

## Dependencies

- **Runtime:** Bun, Terraform
- **npm packages:** A CLI argument parser (e.g., `commander`) and an interactive prompt library (e.g., `@inquirer/prompts`)
