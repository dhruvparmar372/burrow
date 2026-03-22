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
3. Prompt for provider-specific credentials:
   - **AWS:** Access Key ID + Secret Access Key, or select "Use ambient credentials" to skip explicit keys and let Terraform use the default AWS credential chain (env vars, `~/.aws/credentials`, SSO, etc.)

Running again updates existing values or adds new providers.

### `scaletails add --provider <provider> --region <region>`

Deploys a new exit node. `--provider` defaults to `aws`.

Steps:
1. Validate `terraform` is available on PATH. If not, print an error with install instructions and exit.
2. Read `nodes/config.json`. If missing, print: `"No configuration found. Run 'scaletails config' first."` and exit.
3. Validate the provider/region combo is supported (region must exist in the module's AMI map for AWS).
4. Check `nodes/manifest.json` for duplicates.
5. Create `nodes/<provider>-<region>/main.tf` — a generated root config (see Generated Root Config section below).
6. Run `terraform init` in that directory. If init fails, clean up the directory and exit.
7. Run `terraform apply`. If apply fails, leave the directory and state in place for debugging (partial applies may have created real resources).
8. On success, add entry to `nodes/manifest.json`.

Optional `--auto-approve` flag to skip Terraform's confirmation prompt.

### `scaletails list`

Reads `nodes/manifest.json` and prints a table:

```
PROVIDER  REGION        CREATED
aws       ap-south-1    2026-03-22 10:30 UTC
aws       me-central-1  2026-03-22 11:15 UTC
```

If no nodes exist, prints: `"No active exit nodes."`

### `scaletails remove --provider <provider> --region <region>`

Tears down an exit node. `--provider` defaults to `aws`.

Steps:
1. Look up the node in `nodes/manifest.json`. If not found, print an error and exit.
2. Run `terraform destroy` in the node's directory, streaming all output.
3. On success, remove entry from manifest and delete the node directory.
4. On failure, leave everything in place for debugging.

Optional `--auto-approve` flag.

### `scaletails remove --all`

Tears down all active exit nodes sequentially. Prompts for confirmation before proceeding (unless `--auto-approve` is passed).

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
│       ├── outputs.tf            # instance_id, public_ip
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
      "secretAccessKey": "...",
      "useAmbientCredentials": false
    }
  }
}
```

When `useAmbientCredentials` is `true`, `accessKeyId` and `secretAccessKey` are omitted and Terraform uses the default AWS credential chain.

## Manifest File (`nodes/manifest.json`)

```json
{
  "nodes": [
    {
      "provider": "aws",
      "region": "ap-south-1",
      "directory": "aws-ap-south-1",
      "createdAt": "2026-03-22T10:30:00Z"
    }
  ]
}
```

## Generated Root Config

When `scaletails add --provider aws --region ap-south-1` runs, it generates `nodes/aws-ap-south-1/main.tf`:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.41"
    }
  }
}

provider "aws" {
  region = "ap-south-1"
}

module "exit_node" {
  source = "../../modules/aws-exit-node"

  aws_region         = "ap-south-1"
  tailscale_auth_key = var.tailscale_auth_key
}

variable "tailscale_auth_key" {
  type      = string
  sensitive = true
}
```

The Tailscale auth key is passed as a `-var` flag by the CLI. AWS credentials are injected as environment variables on the child process (unless using ambient credentials).

## Terraform Module Changes

The existing `.tf` files move into `modules/aws-exit-node/` with these changes:

- **Remove** `profile = "dhruv-dev"` from the `provider "aws"` block. The provider block is removed entirely from the module since the root config defines it.
- **IAM resource names** get a region suffix to avoid collisions (IAM is global): `"ec2-ssm-role-${var.aws_region}"`, `"ec2-ssm-instance-profile-${var.aws_region}"`.
- **`templatefile` path** changes to `${path.module}/user_data.tftpl` since the module is no longer at the Terraform root.
- **Add `outputs.tf`** exposing `instance_id` and `public_ip` for observability.

## Terraform Runner (`terraform.ts`)

Shells out to `terraform` using `Bun.spawn` with:
- `stdin: "inherit"` — allows user to interact with Terraform prompts
- `stdout: "inherit"` — streams Terraform output in real time
- `stderr: "inherit"` — streams errors in real time

Provider credentials are passed as environment variables on the child process (when not using ambient credentials). Terraform variables (tailscale auth key) are passed as `-var` flags.

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

## CLI Invocation

During development: `bun run cli/src/index.ts <command>`.

For distribution, `package.json` defines a `bin` entry pointing to `src/index.ts`, allowing `bunx scaletails <command>` or installation via `bun link` for a global `scaletails` command.

## Dependencies

- **Runtime:** Bun, Terraform
- **npm packages:** A CLI argument parser (e.g., `commander`) and an interactive prompt library (e.g., `@inquirer/prompts`)

## Security Note

`nodes/config.json` stores credentials in plaintext. The directory is gitignored, but users should be aware of this. Future improvement could integrate with OS keychain or a secrets manager.
