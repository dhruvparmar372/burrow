# ScaleTails CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Makefile-based Terraform workflow with a Bun + TypeScript CLI that manages multiple simultaneous Tailscale exit nodes with isolated state per node.

**Architecture:** The CLI is a thin orchestrator. It manages a config file (credentials), a manifest file (active nodes), and generates per-node Terraform root configs that call shared modules. Terraform is invoked as a child process with streamed IO. Each node gets its own directory under `nodes/` with isolated state.

**Tech Stack:** Bun, TypeScript, Commander.js (CLI parsing), @inquirer/prompts (interactive input), Terraform (shelled out)

**Spec:** `docs/superpowers/specs/2026-03-22-scaletails-cli-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `modules/aws-exit-node/main.tf` | Create (from `terraform/main.tf`) | EC2 + IAM resources, no provider block |
| `modules/aws-exit-node/variables.tf` | Create (from `terraform/variables.tf`) | Region, auth key, instance type, AMI map |
| `modules/aws-exit-node/outputs.tf` | Create | Instance ID + public IP outputs |
| `modules/aws-exit-node/user_data.tftpl` | Create (from `terraform/user_data.tftpl`) | Tailscale install + exit node setup |
| `cli/package.json` | Create | Dependencies, bin entry, scripts |
| `cli/tsconfig.json` | Create | TypeScript config for Bun |
| `cli/src/index.ts` | Create | Entry point, Commander program setup |
| `cli/src/config.ts` | Create | Load/save/validate `nodes/config.json` |
| `cli/src/manifest.ts` | Create | Load/save `nodes/manifest.json` |
| `cli/src/terraform.ts` | Create | Generate HCL, run terraform, stream IO |
| `cli/src/utils.ts` | Create | Shared utilities (exitWithError, resolveProjectRoot) |
| `cli/src/commands/config.ts` | Create | Interactive + non-interactive config command |
| `cli/src/commands/add.ts` | Create | Add exit node command |
| `cli/src/commands/list.ts` | Create | List exit nodes command |
| `cli/src/commands/remove.ts` | Create | Remove exit node(s) command |
| `cli/tests/config.test.ts` | Create | Config load/save/validate tests |
| `cli/tests/manifest.test.ts` | Create | Manifest load/save tests |
| `cli/tests/terraform.test.ts` | Create | HCL generation tests |
| `.gitignore` | Modify | Add `nodes/` |
| `Makefile` | Delete | Replaced by CLI |
| `terraform/` | Delete | Replaced by `modules/aws-exit-node/` |
| `.env.sample` | Delete | Replaced by `scaletails config` |

---

### Task 1: Refactor Terraform into a Module

Move existing Terraform files into `modules/aws-exit-node/` and adapt them to work as a module (no provider block, region-scoped IAM names, `${path.module}` for templatefile).

**Files:**
- Create: `modules/aws-exit-node/main.tf`
- Create: `modules/aws-exit-node/variables.tf`
- Create: `modules/aws-exit-node/outputs.tf`
- Move: `terraform/user_data.tftpl` → `modules/aws-exit-node/user_data.tftpl`

- [ ] **Step 1: Create `modules/aws-exit-node/` directory**

Run: `mkdir -p modules/aws-exit-node`

- [ ] **Step 2: Create `modules/aws-exit-node/main.tf`**

Adapted from `terraform/main.tf` — provider block removed, IAM names region-scoped, templatefile uses `${path.module}`:

```hcl
resource "aws_iam_role" "ec2_ssm_role" {
  name = "ec2-ssm-role-${var.aws_region}"
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
  role = aws_iam_role.ec2_ssm_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_ssm_instance_profile" {
  name = "ec2-ssm-instance-profile-${var.aws_region}"
  role = aws_iam_role.ec2_ssm_role.name
}

resource "aws_instance" "ts_exit_node" {
  ami                         = lookup(var.aws_instance_ami_id, var.aws_region, "")
  instance_type               = var.aws_instance_type
  associate_public_ip_address = true

  iam_instance_profile = aws_iam_instance_profile.ec2_ssm_instance_profile.name

  metadata_options {
    http_tokens = "required"
  }

  user_data = templatefile("${path.module}/user_data.tftpl", {
    tailscale_auth_key = var.tailscale_auth_key,
    tailscale_hostname = "TSExitNode-${var.aws_region}"
  })

  tags = {
    Name = "TSExitNode-${var.aws_region}"
  }
}
```

- [ ] **Step 3: Create `modules/aws-exit-node/variables.tf`**

Same as existing but without the region validation (the CLI handles that):

```hcl
variable "aws_region" {
  type = string
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

variable "tailscale_auth_key" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.tailscale_auth_key) > 0
    error_message = "Tailscale Auth Key is required."
  }
}
```

- [ ] **Step 4: Create `modules/aws-exit-node/outputs.tf`**

```hcl
output "instance_id" {
  value = aws_instance.ts_exit_node.id
}

output "public_ip" {
  value = aws_instance.ts_exit_node.public_ip
}
```

- [ ] **Step 5: Copy `user_data.tftpl` to the module**

Run: `cp terraform/user_data.tftpl modules/aws-exit-node/user_data.tftpl`

- [ ] **Step 6: Commit**

```bash
git add modules/
git commit -m "refactor: move terraform config into reusable aws-exit-node module"
```

---

### Task 2: Scaffold the CLI Project

Set up the Bun + TypeScript project with dependencies, tsconfig, and the entry point with Commander.

**Files:**
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/src/index.ts`

- [ ] **Step 1: Create `cli/package.json`**

```json
{
  "name": "scaletails",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "scaletails": "src/index.ts"
  },
  "scripts": {
    "dev": "bun run src/index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "commander": "^13.0.0",
    "@inquirer/prompts": "^7.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 2: Create `cli/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create `cli/src/index.ts`**

Minimal entry point with Commander — commands will be wired in later tasks:

```typescript
#!/usr/bin/env bun
import { Command } from "commander";

const program = new Command();

program
  .name("scaletails")
  .description("Manage Tailscale exit nodes across cloud providers")
  .version("0.1.0");

program.parse();
```

- [ ] **Step 4: Install dependencies**

Run: `cd cli && bun install`

- [ ] **Step 5: Verify the scaffold works**

Run: `cd cli && bun run src/index.ts --help`
Expected: Help output showing "Manage Tailscale exit nodes across cloud providers"

- [ ] **Step 6: Commit**

```bash
git add cli/
git commit -m "feat: scaffold CLI project with bun, commander, and inquirer"
```

---

### Task 3: Config Module (load/save/validate)

Build the data layer for reading, writing, and validating `nodes/config.json`. TDD.

**Files:**
- Create: `cli/src/config.ts`
- Create: `cli/tests/config.test.ts`

- [ ] **Step 1: Write failing tests for config module**

```typescript
// cli/tests/config.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, saveConfig, validateConfig, getNodesDir } from "../src/config";
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";

const TEST_NODES_DIR = join(import.meta.dir, "fixtures", "nodes");

describe("config", () => {
  beforeEach(() => {
    mkdirSync(TEST_NODES_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_NODES_DIR, { recursive: true, force: true });
  });

  test("loadConfig returns null when config does not exist", () => {
    const config = loadConfig(TEST_NODES_DIR);
    expect(config).toBeNull();
  });

  test("saveConfig writes and loadConfig reads back", () => {
    const config = {
      tailscale: { authKey: "tskey-auth-test123" },
      providers: {
        aws: {
          accessKeyId: "AKIATEST",
          secretAccessKey: "secret123",
          useAmbientCredentials: false,
        },
      },
    };
    saveConfig(config, TEST_NODES_DIR);
    const loaded = loadConfig(TEST_NODES_DIR);
    expect(loaded).toEqual(config);
  });

  test("saveConfig merges with existing config", () => {
    const initial = {
      tailscale: { authKey: "tskey-auth-old" },
      providers: {},
    };
    saveConfig(initial, TEST_NODES_DIR);

    const update = {
      tailscale: { authKey: "tskey-auth-new" },
      providers: {
        aws: {
          accessKeyId: "AKIATEST",
          secretAccessKey: "secret",
          useAmbientCredentials: false,
        },
      },
    };
    saveConfig(update, TEST_NODES_DIR);
    const loaded = loadConfig(TEST_NODES_DIR);
    expect(loaded!.tailscale.authKey).toBe("tskey-auth-new");
    expect(loaded!.providers.aws).toBeDefined();
  });

  test("validateConfig returns errors for missing tailscale auth key", () => {
    const config = {
      tailscale: { authKey: "" },
      providers: {},
    };
    const errors = validateConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Tailscale");
  });

  test("validateConfig returns errors for AWS missing credentials without ambient", () => {
    const config = {
      tailscale: { authKey: "tskey-auth-test" },
      providers: {
        aws: {
          accessKeyId: "",
          secretAccessKey: "",
          useAmbientCredentials: false,
        },
      },
    };
    const errors = validateConfig(config);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("validateConfig passes for AWS with ambient credentials", () => {
    const config = {
      tailscale: { authKey: "tskey-auth-test" },
      providers: {
        aws: {
          accessKeyId: "",
          secretAccessKey: "",
          useAmbientCredentials: true,
        },
      },
    };
    const errors = validateConfig(config);
    expect(errors).toEqual([]);
  });

  test("validateConfig passes for valid config", () => {
    const config = {
      tailscale: { authKey: "tskey-auth-test" },
      providers: {
        aws: {
          accessKeyId: "AKIATEST",
          secretAccessKey: "secret",
          useAmbientCredentials: false,
        },
      },
    };
    const errors = validateConfig(config);
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test tests/config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement config module**

```typescript
// cli/src/config.ts
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

export interface AwsProviderConfig {
  accessKeyId: string;
  secretAccessKey: string;
  useAmbientCredentials: boolean;
}

export interface ScaleTailsConfig {
  tailscale: {
    authKey: string;
  };
  providers: {
    aws?: AwsProviderConfig;
  };
}

const CONFIG_FILE = "config.json";

export function getNodesDir(): string {
  return join(resolveProjectRoot(), "nodes");
}

/**
 * Find the project root by looking for the modules/ directory,
 * walking up from cwd. This works regardless of how the CLI is invoked
 * (bun run, bunx, bun link, etc.)
 */
export function resolveProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== "/") {
    if (existsSync(join(dir, "modules"))) return dir;
    dir = join(dir, "..");
  }
  // Fallback to cwd if no marker found
  return process.cwd();
}

export function loadConfig(nodesDir?: string): ScaleTailsConfig | null {
  const dir = nodesDir ?? getNodesDir();
  const configPath = join(dir, CONFIG_FILE);
  if (!existsSync(configPath)) return null;
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as ScaleTailsConfig;
}

export function saveConfig(config: ScaleTailsConfig, nodesDir?: string): void {
  const dir = nodesDir ?? getNodesDir();
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, CONFIG_FILE);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

export function validateConfig(config: ScaleTailsConfig): string[] {
  const errors: string[] = [];

  if (!config.tailscale?.authKey) {
    errors.push("Tailscale auth key is required.");
  }

  const aws = config.providers?.aws;
  if (aws && !aws.useAmbientCredentials) {
    if (!aws.accessKeyId) {
      errors.push("AWS Access Key ID is required when not using ambient credentials.");
    }
    if (!aws.secretAccessKey) {
      errors.push("AWS Secret Access Key is required when not using ambient credentials.");
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && bun test tests/config.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/config.ts cli/tests/config.test.ts
git commit -m "feat: add config module with load/save/validate and tests"
```

---

### Task 4: Manifest Module (load/save)

Build the data layer for reading and writing `nodes/manifest.json`. TDD.

**Files:**
- Create: `cli/src/manifest.ts`
- Create: `cli/tests/manifest.test.ts`

- [ ] **Step 1: Write failing tests for manifest module**

```typescript
// cli/tests/manifest.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadManifest, saveManifest, addNode, removeNode, findNode } from "../src/manifest";
import { join } from "path";
import { mkdirSync, rmSync } from "fs";

const TEST_NODES_DIR = join(import.meta.dir, "fixtures", "nodes");

describe("manifest", () => {
  beforeEach(() => {
    mkdirSync(TEST_NODES_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_NODES_DIR, { recursive: true, force: true });
  });

  test("loadManifest returns empty nodes when file does not exist", () => {
    const manifest = loadManifest(TEST_NODES_DIR);
    expect(manifest).toEqual({ nodes: [] });
  });

  test("addNode adds a node entry", () => {
    const manifest = loadManifest(TEST_NODES_DIR);
    const updated = addNode(manifest, "aws", "ap-south-1");
    expect(updated.nodes).toHaveLength(1);
    expect(updated.nodes[0].provider).toBe("aws");
    expect(updated.nodes[0].region).toBe("ap-south-1");
    expect(updated.nodes[0].directory).toBe("aws-ap-south-1");
    expect(updated.nodes[0].createdAt).toBeDefined();
  });

  test("findNode returns matching node", () => {
    let manifest = loadManifest(TEST_NODES_DIR);
    manifest = addNode(manifest, "aws", "ap-south-1");
    const found = findNode(manifest, "aws", "ap-south-1");
    expect(found).toBeDefined();
    expect(found!.region).toBe("ap-south-1");
  });

  test("findNode returns undefined for non-existent node", () => {
    const manifest = loadManifest(TEST_NODES_DIR);
    const found = findNode(manifest, "aws", "us-east-1");
    expect(found).toBeUndefined();
  });

  test("removeNode removes matching node", () => {
    let manifest = loadManifest(TEST_NODES_DIR);
    manifest = addNode(manifest, "aws", "ap-south-1");
    manifest = addNode(manifest, "aws", "me-central-1");
    manifest = removeNode(manifest, "aws", "ap-south-1");
    expect(manifest.nodes).toHaveLength(1);
    expect(manifest.nodes[0].region).toBe("me-central-1");
  });

  test("saveManifest writes and loadManifest reads back", () => {
    let manifest = loadManifest(TEST_NODES_DIR);
    manifest = addNode(manifest, "aws", "ap-south-1");
    saveManifest(manifest, TEST_NODES_DIR);
    const loaded = loadManifest(TEST_NODES_DIR);
    expect(loaded.nodes).toHaveLength(1);
    expect(loaded.nodes[0].provider).toBe("aws");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test tests/manifest.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement manifest module**

```typescript
// cli/src/manifest.ts
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { getNodesDir } from "./config";

export interface NodeEntry {
  provider: string;
  region: string;
  directory: string;
  createdAt: string;
}

export interface Manifest {
  nodes: NodeEntry[];
}

const MANIFEST_FILE = "manifest.json";

export function loadManifest(nodesDir?: string): Manifest {
  const dir = nodesDir ?? getNodesDir();
  const manifestPath = join(dir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) return { nodes: [] };
  const raw = readFileSync(manifestPath, "utf-8");
  return JSON.parse(raw) as Manifest;
}

export function saveManifest(manifest: Manifest, nodesDir?: string): void {
  const dir = nodesDir ?? getNodesDir();
  mkdirSync(dir, { recursive: true });
  const manifestPath = join(dir, MANIFEST_FILE);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

export function addNode(manifest: Manifest, provider: string, region: string): Manifest {
  const directory = `${provider}-${region}`;
  const entry: NodeEntry = {
    provider,
    region,
    directory,
    createdAt: new Date().toISOString(),
  };
  return { nodes: [...manifest.nodes, entry] };
}

export function removeNode(manifest: Manifest, provider: string, region: string): Manifest {
  return {
    nodes: manifest.nodes.filter(
      (n) => !(n.provider === provider && n.region === region)
    ),
  };
}

export function findNode(manifest: Manifest, provider: string, region: string): NodeEntry | undefined {
  return manifest.nodes.find(
    (n) => n.provider === provider && n.region === region
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && bun test tests/manifest.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/manifest.ts cli/tests/manifest.test.ts
git commit -m "feat: add manifest module with node CRUD operations and tests"
```

---

### Task 5: Terraform Runner (HCL generation + process spawning)

Build the module that generates root HCL configs and shells out to Terraform. TDD for generation logic; spawn logic is tested via integration.

**Files:**
- Create: `cli/src/terraform.ts`
- Create: `cli/tests/terraform.test.ts`

- [ ] **Step 1: Write failing tests for HCL generation**

```typescript
// cli/tests/terraform.test.ts
import { describe, test, expect } from "bun:test";
import { generateAwsRootConfig, getSupportedRegions } from "../src/terraform";

describe("terraform", () => {
  test("generateAwsRootConfig produces valid HCL for ap-south-1", () => {
    const hcl = generateAwsRootConfig("ap-south-1");
    expect(hcl).toContain('source  = "hashicorp/aws"');
    expect(hcl).toContain('region = "ap-south-1"');
    expect(hcl).toContain('source = "../../modules/aws-exit-node"');
    expect(hcl).toContain('aws_region         = "ap-south-1"');
    expect(hcl).toContain("tailscale_auth_key");
    expect(hcl).toContain("sensitive = true");
  });

  test("generateAwsRootConfig uses correct module path", () => {
    const hcl = generateAwsRootConfig("me-central-1");
    expect(hcl).toContain('source = "../../modules/aws-exit-node"');
    expect(hcl).toContain('region = "me-central-1"');
  });

  test("getSupportedRegions returns known AWS regions", () => {
    const regions = getSupportedRegions("aws");
    expect(regions).toContain("ap-south-1");
    expect(regions).toContain("me-central-1");
  });

  test("getSupportedRegions returns empty for unknown provider", () => {
    const regions = getSupportedRegions("gcp");
    expect(regions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test tests/terraform.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement terraform module**

```typescript
// cli/src/terraform.ts
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
    const encoder = new TextEncoder();
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && bun test tests/terraform.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/terraform.ts cli/tests/terraform.test.ts
git commit -m "feat: add terraform runner with HCL generation and process spawning"
```

---

### Task 6: Shared Utilities

Extract shared helpers used by multiple commands.

**Files:**
- Create: `cli/src/utils.ts`

- [ ] **Step 1: Create `cli/src/utils.ts`**

```typescript
// cli/src/utils.ts

/**
 * Print an error message and exit. In JSON mode, writes structured JSON to stderr.
 */
export function exitWithError(message: string, json: boolean): never {
  if (json) {
    process.stderr.write(JSON.stringify({ error: message }) + "\n");
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}
```

- [ ] **Step 2: Commit**

```bash
git add cli/src/utils.ts
git commit -m "feat: add shared utility module with exitWithError"
```

---

### Task 7: Config Command

Implement `scaletails config` — interactive wizard and non-interactive flag/file modes.

**Files:**
- Create: `cli/src/commands/config.ts`
- Modify: `cli/src/index.ts` (wire up command)

- [ ] **Step 1: Create `cli/src/commands/config.ts`**

```typescript
// cli/src/commands/config.ts
import { Command } from "commander";
import { input, select, password } from "@inquirer/prompts";
import { loadConfig, saveConfig, validateConfig, getNodesDir } from "../config";
import type { ScaleTailsConfig } from "../config";
import { readFileSync, existsSync } from "fs";

export function createConfigCommand(): Command {
  const cmd = new Command("config")
    .description("Configure credentials for Tailscale and cloud providers")
    .option("--tailscale-auth-key <key>", "Tailscale auth key")
    .option("--aws-access-key-id <id>", "AWS access key ID")
    .option("--aws-secret-access-key <secret>", "AWS secret access key")
    .option("--aws-use-ambient-credentials", "Use ambient AWS credentials")
    .option("--from-file <path>", "Import config from a JSON file")
    .option("--json", "Output result as JSON (non-interactive mode)")
    .action(async (opts) => {
      const isNonInteractive = opts.json || opts.fromFile || opts.tailscaleAuthKey || opts.awsAccessKeyId || opts.awsSecretAccessKey || opts.awsUseAmbientCredentials;

      if (isNonInteractive) {
        await handleNonInteractive(opts);
      } else {
        await handleInteractive();
      }
    });

  return cmd;
}

async function handleNonInteractive(opts: {
  tailscaleAuthKey?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsUseAmbientCredentials?: boolean;
  fromFile?: string;
  json?: boolean;
}): Promise<void> {
  let config: ScaleTailsConfig;

  // Start from file import or existing config
  if (opts.fromFile) {
    if (!existsSync(opts.fromFile)) {
      const err = { error: `File not found: ${opts.fromFile}` };
      process.stderr.write(JSON.stringify(err) + "\n");
      process.exit(1);
    }
    const raw = readFileSync(opts.fromFile, "utf-8");
    config = JSON.parse(raw) as ScaleTailsConfig;
  } else {
    config = loadConfig() ?? { tailscale: { authKey: "" }, providers: {} };
  }

  // Apply flag overrides
  if (opts.tailscaleAuthKey) {
    config.tailscale.authKey = opts.tailscaleAuthKey;
  }

  if (opts.awsUseAmbientCredentials) {
    config.providers.aws = {
      accessKeyId: "",
      secretAccessKey: "",
      useAmbientCredentials: true,
    };
  } else if (opts.awsAccessKeyId || opts.awsSecretAccessKey) {
    config.providers.aws = {
      accessKeyId: opts.awsAccessKeyId ?? config.providers.aws?.accessKeyId ?? "",
      secretAccessKey: opts.awsSecretAccessKey ?? config.providers.aws?.secretAccessKey ?? "",
      useAmbientCredentials: false,
    };
  }

  const errors = validateConfig(config);
  if (errors.length > 0) {
    const err = { error: errors.join("; ") };
    process.stderr.write(JSON.stringify(err) + "\n");
    process.exit(1);
  }

  saveConfig(config);
  const nodesDir = getNodesDir();
  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", configPath: `${nodesDir}/config.json` }));
  } else {
    console.log("Configuration saved.");
  }
}

async function handleInteractive(): Promise<void> {
  const existing = loadConfig() ?? { tailscale: { authKey: "" }, providers: {} };

  const authKey = await password({
    message: "Tailscale Auth Key:",
    mask: "*",
    default: existing.tailscale.authKey || undefined,
  });
  existing.tailscale.authKey = authKey;

  const provider = await select({
    message: "Select provider to configure:",
    choices: [{ name: "aws", value: "aws" }],
  });

  if (provider === "aws") {
    const credMethod = await select({
      message: "AWS credential method:",
      choices: [
        { name: "Access Key ID + Secret Access Key", value: "explicit" },
        { name: "Use ambient credentials (env vars, ~/.aws, SSO)", value: "ambient" },
      ],
    });

    if (credMethod === "ambient") {
      existing.providers.aws = {
        accessKeyId: "",
        secretAccessKey: "",
        useAmbientCredentials: true,
      };
    } else {
      const accessKeyId = await input({
        message: "AWS Access Key ID:",
        default: existing.providers.aws?.accessKeyId || undefined,
      });
      const secretAccessKey = await password({
        message: "AWS Secret Access Key:",
        mask: "*",
        default: existing.providers.aws?.secretAccessKey || undefined,
      });
      existing.providers.aws = {
        accessKeyId,
        secretAccessKey,
        useAmbientCredentials: false,
      };
    }
  }

  const errors = validateConfig(existing);
  if (errors.length > 0) {
    console.error("Validation errors:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  saveConfig(existing);
  console.log("\n✓ Configuration saved.");
}
```

- [ ] **Step 2: Wire up the config command in `cli/src/index.ts`**

Replace the contents of `cli/src/index.ts` with:

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { createConfigCommand } from "./commands/config";

const program = new Command();

program
  .name("scaletails")
  .description("Manage Tailscale exit nodes across cloud providers")
  .version("0.1.0");

program.addCommand(createConfigCommand());

program.parse();
```

- [ ] **Step 3: Verify interactive mode works**

Run: `cd cli && bun run src/index.ts config --help`
Expected: Help output showing config options

- [ ] **Step 4: Verify non-interactive mode works**

Run: `cd cli && bun run src/index.ts config --tailscale-auth-key tskey-auth-test --aws-access-key-id AKIATEST --aws-secret-access-key testsecret --json`
Expected: `{"status":"ok","configPath":"..."}`

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/config.ts cli/src/index.ts
git commit -m "feat: add config command with interactive and non-interactive modes"
```

---

### Task 8: Add Command

Implement `scaletails add` — validates inputs, generates root config, runs Terraform, updates manifest.

**Files:**
- Create: `cli/src/commands/add.ts`
- Modify: `cli/src/index.ts` (wire up command)

- [ ] **Step 1: Create `cli/src/commands/add.ts`**

```typescript
// cli/src/commands/add.ts
import { Command } from "commander";
import { loadConfig, getNodesDir } from "../config";
import { loadManifest, saveManifest, addNode, findNode } from "../manifest";
import {
  checkTerraformInstalled,
  getSupportedRegions,
  generateAwsRootConfig,
  createNodeDirectory,
  writeRootConfig,
  cleanupNodeDirectory,
  runTerraform,
  buildAwsEnvVars,
} from "../terraform";
import { exitWithError } from "../utils";

export function createAddCommand(): Command {
  const cmd = new Command("add")
    .description("Deploy a new Tailscale exit node")
    .requiredOption("--region <region>", "Cloud provider region")
    .option("--provider <provider>", "Cloud provider", "aws")
    .option("--auto-approve", "Skip Terraform confirmation prompt")
    .option("--json", "Output result as JSON")
    .action(async (opts) => {
      const { provider, region, autoApprove, json } = opts;

      // 1. Check terraform
      if (!checkTerraformInstalled()) {
        exitWithError("terraform is not installed or not on PATH. Install from https://developer.hashicorp.com/terraform/install", json);
      }

      // 2. Check config
      const config = loadConfig();
      if (!config) {
        exitWithError("No configuration found. Run 'scaletails config' first.", json);
      }

      // 3. Validate provider/region
      const supportedRegions = getSupportedRegions(provider);
      if (supportedRegions.length === 0) {
        exitWithError(`Unknown provider: ${provider}`, json);
      }
      if (!supportedRegions.includes(region)) {
        exitWithError(`Region '${region}' is not supported for provider '${provider}'. Supported: ${supportedRegions.join(", ")}`, json);
      }

      // 4. Check for provider config
      const providerConfig = config.providers[provider as keyof typeof config.providers];
      if (!providerConfig) {
        exitWithError(`Provider '${provider}' is not configured. Run 'scaletails config' first.`, json);
      }

      // 5. Check duplicates
      const manifest = loadManifest();
      if (findNode(manifest, provider, region)) {
        exitWithError(`Exit node already exists: ${provider}/${region}`, json);
      }

      // 6. Generate root config
      let hcl: string;
      if (provider === "aws") {
        hcl = generateAwsRootConfig(region);
      } else {
        exitWithError(`Provider '${provider}' is not yet implemented.`, json);
      }

      const nodeDir = createNodeDirectory(provider, region);
      writeRootConfig(nodeDir, hcl);

      // 7. Build env vars
      const envVars = provider === "aws" ? buildAwsEnvVars(providerConfig as any) : {};
      const vars = { tailscale_auth_key: config.tailscale.authKey };

      // 8. terraform init
      if (!json) console.log(`\nInitializing Terraform for ${provider}/${region}...`);
      const initCode = await runTerraform({
        command: "init",
        cwd: nodeDir,
        envVars,
        jsonMode: json,
      });
      if (initCode !== 0) {
        cleanupNodeDirectory(nodeDir);
        exitWithError("terraform init failed. Directory cleaned up.", json);
      }

      // 9. terraform apply
      if (!json) console.log(`\nDeploying exit node in ${provider}/${region}...`);
      const applyCode = await runTerraform({
        command: "apply",
        cwd: nodeDir,
        autoApprove,
        vars,
        envVars,
        jsonMode: json,
      });
      if (applyCode !== 0) {
        // Don't clean up — partial apply may have created resources
        exitWithError(`terraform apply failed. State preserved in nodes/${provider}-${region}/ for debugging.`, json);
      }

      // 10. Update manifest
      const updated = addNode(manifest, provider, region);
      saveManifest(updated);

      const directory = `${provider}-${region}`;
      if (json) {
        console.log(JSON.stringify({ status: "ok", provider, region, directory }));
      } else {
        console.log(`\n✓ Exit node deployed: ${provider}/${region}`);
      }
    });

  return cmd;
}
```

- [ ] **Step 2: Wire up the add command in `cli/src/index.ts`**

Add import and `program.addCommand(createAddCommand())` alongside the config command:

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { createConfigCommand } from "./commands/config";
import { createAddCommand } from "./commands/add";

const program = new Command();

program
  .name("scaletails")
  .description("Manage Tailscale exit nodes across cloud providers")
  .version("0.1.0");

program.addCommand(createConfigCommand());
program.addCommand(createAddCommand());

program.parse();
```

- [ ] **Step 3: Verify help output**

Run: `cd cli && bun run src/index.ts add --help`
Expected: Help output showing `--region`, `--provider`, `--auto-approve`, `--json` options

- [ ] **Step 4: Commit**

```bash
git add cli/src/commands/add.ts cli/src/index.ts
git commit -m "feat: add 'add' command to deploy exit nodes"
```

---

### Task 9: List Command

Implement `scaletails list` — reads manifest, displays table or JSON.

**Files:**
- Create: `cli/src/commands/list.ts`
- Modify: `cli/src/index.ts` (wire up command)

- [ ] **Step 1: Create `cli/src/commands/list.ts`**

```typescript
// cli/src/commands/list.ts
import { Command } from "commander";
import { loadManifest } from "../manifest";

export function createListCommand(): Command {
  const cmd = new Command("list")
    .description("List all active Tailscale exit nodes")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const manifest = loadManifest();

      if (opts.json) {
        console.log(JSON.stringify(manifest));
        return;
      }

      if (manifest.nodes.length === 0) {
        console.log("No active exit nodes.");
        return;
      }

      // Print table header
      const header = "PROVIDER  REGION            CREATED";
      console.log(header);

      for (const node of manifest.nodes) {
        const created = new Date(node.createdAt);
        const dateStr = created.toISOString().replace("T", " ").slice(0, 19) + " UTC";
        const line = `${node.provider.padEnd(10)}${node.region.padEnd(18)}${dateStr}`;
        console.log(line);
      }
    });

  return cmd;
}
```

- [ ] **Step 2: Wire up the list command in `cli/src/index.ts`**

Add import and `program.addCommand(createListCommand())`:

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { createConfigCommand } from "./commands/config";
import { createAddCommand } from "./commands/add";
import { createListCommand } from "./commands/list";

const program = new Command();

program
  .name("scaletails")
  .description("Manage Tailscale exit nodes across cloud providers")
  .version("0.1.0");

program.addCommand(createConfigCommand());
program.addCommand(createAddCommand());
program.addCommand(createListCommand());

program.parse();
```

- [ ] **Step 3: Verify list command**

Run: `cd cli && bun run src/index.ts list`
Expected: "No active exit nodes."

- [ ] **Step 4: Commit**

```bash
git add cli/src/commands/list.ts cli/src/index.ts
git commit -m "feat: add 'list' command to display active exit nodes"
```

---

### Task 10: Remove Command

Implement `scaletails remove` — tears down a single node or all nodes.

**Files:**
- Create: `cli/src/commands/remove.ts`
- Modify: `cli/src/index.ts` (wire up command)

- [ ] **Step 1: Create `cli/src/commands/remove.ts`**

```typescript
// cli/src/commands/remove.ts
import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { loadConfig, getNodesDir } from "../config";
import { loadManifest, saveManifest, removeNode, findNode } from "../manifest";
import { runTerraform, cleanupNodeDirectory, buildAwsEnvVars } from "../terraform";
import { exitWithError } from "../utils";
import type { AwsProviderConfig } from "../config";
import { join } from "path";

export function createRemoveCommand(): Command {
  const cmd = new Command("remove")
    .description("Tear down a Tailscale exit node")
    .option("--region <region>", "Cloud provider region")
    .option("--provider <provider>", "Cloud provider", "aws")
    .option("--all", "Remove all active exit nodes")
    .option("--auto-approve", "Skip confirmation prompts")
    .option("--json", "Output result as JSON")
    .action(async (opts) => {
      const { provider, region, all, autoApprove, json } = opts;

      if (!all && !region) {
        exitWithError("Either --region or --all is required.", json);
      }

      const config = loadConfig();
      if (!config) {
        exitWithError("No configuration found. Run 'scaletails config' first.", json);
      }

      const manifest = loadManifest();

      if (all) {
        await handleRemoveAll(manifest, config, autoApprove, json);
      } else {
        await handleRemoveSingle(manifest, config, provider, region, autoApprove, json);
      }
    });

  return cmd;
}

async function handleRemoveSingle(
  manifest: ReturnType<typeof loadManifest>,
  config: NonNullable<ReturnType<typeof loadConfig>>,
  provider: string,
  region: string,
  autoApprove: boolean,
  json: boolean
): Promise<void> {
  const node = findNode(manifest, provider, region);
  if (!node) {
    exitWithError(`No exit node found: ${provider}/${region}`, json);
  }

  const nodesDir = getNodesDir();
  const nodeDir = join(nodesDir, node.directory);

  const envVars = provider === "aws"
    ? buildAwsEnvVars(config.providers.aws as AwsProviderConfig)
    : {};
  const vars = { tailscale_auth_key: config.tailscale.authKey };

  if (!json) console.log(`\nDestroying exit node ${provider}/${region}...`);

  const exitCode = await runTerraform({
    command: "destroy",
    cwd: nodeDir,
    autoApprove,
    vars,
    envVars,
    jsonMode: json,
  });

  if (exitCode !== 0) {
    exitWithError(`terraform destroy failed. State preserved for debugging.`, json);
  }

  const updated = removeNode(manifest, provider, region);
  saveManifest(updated);
  cleanupNodeDirectory(nodeDir);

  if (json) {
    console.log(JSON.stringify({ status: "ok", provider, region }));
  } else {
    console.log(`\n✓ Exit node removed: ${provider}/${region}`);
  }
}

async function handleRemoveAll(
  manifest: ReturnType<typeof loadManifest>,
  config: NonNullable<ReturnType<typeof loadConfig>>,
  autoApprove: boolean,
  json: boolean
): Promise<void> {
  if (manifest.nodes.length === 0) {
    if (json) {
      console.log(JSON.stringify({ status: "ok", removed: [] }));
    } else {
      console.log("No active exit nodes to remove.");
    }
    return;
  }

  if (!autoApprove) {
    if (json) {
      exitWithError("--auto-approve is required for non-interactive remove --all.", json);
    }
    const proceed = await confirm({
      message: `Remove all ${manifest.nodes.length} exit node(s)?`,
      default: false,
    });
    if (!proceed) {
      console.log("Aborted.");
      return;
    }
  }

  const results: Array<{ provider: string; region: string; status: string }> = [];
  let currentManifest = manifest;

  for (const node of [...manifest.nodes]) {
    const nodesDir = getNodesDir();
    const nodeDir = join(nodesDir, node.directory);

    const envVars = node.provider === "aws"
      ? buildAwsEnvVars(config.providers.aws as AwsProviderConfig)
      : {};
    const vars = { tailscale_auth_key: config.tailscale.authKey };

    if (!json) console.log(`\nDestroying ${node.provider}/${node.region}...`);

    const exitCode = await runTerraform({
      command: "destroy",
      cwd: nodeDir,
      autoApprove,
      vars,
      envVars,
      jsonMode: json,
    });

    if (exitCode === 0) {
      currentManifest = removeNode(currentManifest, node.provider, node.region);
      saveManifest(currentManifest);
      cleanupNodeDirectory(nodeDir);
      results.push({ provider: node.provider, region: node.region, status: "ok" });
      if (!json) console.log(`✓ Removed ${node.provider}/${node.region}`);
    } else {
      results.push({ provider: node.provider, region: node.region, status: "failed" });
      if (!json) console.error(`✗ Failed to remove ${node.provider}/${node.region}. Skipping.`);
    }
  }

  if (json) {
    console.log(JSON.stringify({ status: "ok", removed: results }));
  }
}
```

- [ ] **Step 2: Wire up the remove command in `cli/src/index.ts`**

Final version of `cli/src/index.ts`:

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { createConfigCommand } from "./commands/config";
import { createAddCommand } from "./commands/add";
import { createListCommand } from "./commands/list";
import { createRemoveCommand } from "./commands/remove";

const program = new Command();

program
  .name("scaletails")
  .description("Manage Tailscale exit nodes across cloud providers")
  .version("0.1.0");

program.addCommand(createConfigCommand());
program.addCommand(createAddCommand());
program.addCommand(createListCommand());
program.addCommand(createRemoveCommand());

program.parse();
```

- [ ] **Step 3: Verify remove help**

Run: `cd cli && bun run src/index.ts remove --help`
Expected: Help output showing `--region`, `--provider`, `--all`, `--auto-approve`, `--json`

- [ ] **Step 4: Commit**

```bash
git add cli/src/commands/remove.ts cli/src/index.ts
git commit -m "feat: add 'remove' command with single and --all modes"
```

---

### Task 11: Cleanup and .gitignore

Remove old files (Makefile, terraform/, .env.sample), update .gitignore.

**Files:**
- Modify: `.gitignore`
- Delete: `Makefile`
- Delete: `terraform/main.tf`
- Delete: `terraform/variables.tf`
- Delete: `terraform/user_data.tftpl`
- Delete: `.env.sample`

- [ ] **Step 1: Update `.gitignore`**

Replace contents with:

```
# Terraform
.terraform
.terraform.lock.hcl
*.tfstate
*.tfstate.backup

# Runtime (credentials + state)
nodes/

# Editor / OS
*.code-workspace
.DS_Store
.vscode/

# Dependencies
cli/node_modules/

# Environment
.env
```

- [ ] **Step 2: Remove old files**

```bash
git rm Makefile .env.sample
git rm -r terraform/
```

- [ ] **Step 3: Verify no stale references**

Run: `cd cli && bun run src/index.ts --help`
Expected: Help output with config, add, list, remove commands

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: remove Makefile and terraform/, update .gitignore for new structure"
```

---

### Task 12: Run All Tests

Verify all unit tests pass together.

- [ ] **Step 1: Run the full test suite**

Run: `cd cli && bun test`
Expected: All tests in config.test.ts, manifest.test.ts, terraform.test.ts pass

- [ ] **Step 2: Fix any issues**

If any tests fail, fix and re-run.

- [ ] **Step 3: Commit any fixes**

Only if changes were needed.

---

### Task 13: Update README

Update the README to document the new CLI.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for new CLI-based workflow"
```
