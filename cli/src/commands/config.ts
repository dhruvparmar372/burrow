// cli/src/commands/config.ts
import { Command } from "commander";
import { input, select, password } from "@inquirer/prompts";
import { loadConfig, saveConfig, validateConfig, getDataDir } from "../config";
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
  const dataDir = getDataDir();
  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", configPath: `${dataDir}/config.json` }));
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
