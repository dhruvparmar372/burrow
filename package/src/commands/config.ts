import { Command } from "commander";
import { loadConfig, saveConfig, validateConfig, getDataDir } from "../config";
import type { BurrowConfig } from "../config";
import { readFileSync, existsSync } from "fs";
import { exitWithError } from "../utils";

function redact(value: string): string {
  if (!value || value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

function printConfig(config: BurrowConfig, json: boolean): void {
  const redacted = {
    tailscale: {
      authKey: redact(config.tailscale.authKey),
    },
    providers: {} as Record<string, unknown>,
  };

  if (config.providers.aws) {
    if (config.providers.aws.useAmbientCredentials) {
      redacted.providers.aws = { useAmbientCredentials: true };
    } else {
      redacted.providers.aws = {
        accessKeyId: redact(config.providers.aws.accessKeyId),
        secretAccessKey: redact(config.providers.aws.secretAccessKey),
        useAmbientCredentials: false,
      };
    }
  }

  if (json) {
    console.log(JSON.stringify(redacted, null, 2));
  } else {
    console.log("\nCurrent configuration:\n");
    console.log(`  Tailscale Auth Key:    ${redacted.tailscale.authKey}`);
    if (config.providers.aws) {
      if (config.providers.aws.useAmbientCredentials) {
        console.log(`  AWS Credentials:       ambient (env vars, ~/.aws, SSO)`);
      } else {
        console.log(`  AWS Access Key ID:     ${(redacted.providers.aws as { accessKeyId: string }).accessKeyId}`);
        console.log(`  AWS Secret Access Key: ${(redacted.providers.aws as { secretAccessKey: string }).secretAccessKey}`);
      }
    } else {
      console.log(`  AWS:                   not configured`);
    }
    console.log(`\n  Config path: ${getDataDir()}/config.json`);
  }
}

export function createConfigCommand(): Command {
  const cmd = new Command("config")
    .description("View or update Burrow configuration")
    .option("--tailscale-auth-key <key>", "Tailscale auth key")
    .option("--aws-access-key-id <id>", "AWS access key ID")
    .option("--aws-secret-access-key <secret>", "AWS secret access key")
    .option("--aws-use-ambient-credentials", "Use ambient AWS credentials")
    .option("--from-file <path>", "Import config from a JSON file")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const hasUpdateFlags = opts.fromFile || opts.tailscaleAuthKey || opts.awsAccessKeyId || opts.awsSecretAccessKey || opts.awsUseAmbientCredentials;

      if (hasUpdateFlags) {
        await handleUpdate(opts);
      } else {
        // View mode
        const config = loadConfig();
        if (!config) {
          exitWithError("No configuration found. Run 'burrow init' first.", opts.json);
        }
        printConfig(config, opts.json);
      }
    });

  return cmd;
}

async function handleUpdate(opts: {
  tailscaleAuthKey?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsUseAmbientCredentials?: boolean;
  fromFile?: string;
  json?: boolean;
}): Promise<void> {
  let config: BurrowConfig;

  if (opts.fromFile) {
    if (!existsSync(opts.fromFile)) {
      const err = { error: `File not found: ${opts.fromFile}` };
      process.stderr.write(JSON.stringify(err) + "\n");
      process.exit(1);
    }
    const raw = readFileSync(opts.fromFile, "utf-8");
    config = JSON.parse(raw) as BurrowConfig;
  } else {
    config = loadConfig() ?? { tailscale: { authKey: "" }, providers: {} };
  }

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
    console.log("✓ Configuration updated.");
  }
}
