import { Command } from "commander";
import { loadConfig, saveConfig, validateConfig, getDataDir } from "../config";
import type { BurrowConfig } from "../config";
import { readFileSync, existsSync } from "fs";
import { exitWithError } from "../utils";
import { getProvider, getAllProviderNames } from "../providers";

function redact(value: string): string {
  if (!value || value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

function printConfig(config: BurrowConfig, json: boolean): void {
  const redacted: Record<string, unknown> = {
    tailscale: { authKey: redact(config.tailscale.authKey) },
    providers: {} as Record<string, unknown>,
  };

  const providers = redacted.providers as Record<string, unknown>;
  for (const [name, providerConfig] of Object.entries(config.providers)) {
    const provider = getProvider(name);
    if (provider) {
      providers[name] = provider.redactConfig(providerConfig);
    }
  }

  if (json) {
    console.log(JSON.stringify(redacted, null, 2));
  } else {
    console.log("\nCurrent configuration:\n");
    console.log(`  Tailscale Auth Key:  ${redact(config.tailscale.authKey)}`);

    for (const providerName of getAllProviderNames()) {
      const provider = getProvider(providerName)!;
      const providerConfig = config.providers[providerName];
      if (providerConfig) {
        const redactedConfig = provider.redactConfig(providerConfig);
        console.log(`\n  ${provider.displayName}:`);
        for (const [key, value] of Object.entries(redactedConfig)) {
          console.log(`    ${key}: ${value}`);
        }
      } else {
        console.log(`\n  ${provider.displayName}: not configured`);
      }
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
    .option("--hetzner-api-token <token>", "Hetzner Cloud API token")
    .option("--gcp-project-id <id>", "GCP project ID")
    .option("--gcp-credentials-json <json>", "GCP service account JSON")
    .option("--from-file <path>", "Import config from a JSON file")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const hasUpdateFlags = opts.fromFile || opts.tailscaleAuthKey
        || opts.awsAccessKeyId || opts.awsSecretAccessKey
        || opts.hetznerApiToken
        || opts.gcpProjectId || opts.gcpCredentialsJson;

      if (hasUpdateFlags) {
        await handleUpdate(opts);
      } else {
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
  hetznerApiToken?: string;
  gcpProjectId?: string;
  gcpCredentialsJson?: string;
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

  // AWS
  if (opts.awsAccessKeyId || opts.awsSecretAccessKey) {
    const existing = config.providers.aws ?? {};
    config.providers.aws = {
      ...existing,
      ...(opts.awsAccessKeyId && { accessKeyId: opts.awsAccessKeyId }),
      ...(opts.awsSecretAccessKey && { secretAccessKey: opts.awsSecretAccessKey }),
    };
  }

  // Hetzner
  if (opts.hetznerApiToken) {
    config.providers.hetzner = {
      ...(config.providers.hetzner ?? {}),
      apiToken: opts.hetznerApiToken,
    };
  }

  // GCP
  if (opts.gcpProjectId || opts.gcpCredentialsJson) {
    const existing = config.providers.gcp ?? {};
    config.providers.gcp = {
      ...existing,
      ...(opts.gcpProjectId && { projectId: opts.gcpProjectId }),
      ...(opts.gcpCredentialsJson && { credentialsJson: opts.gcpCredentialsJson }),
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
