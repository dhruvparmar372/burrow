import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { loadConfig, getNodesDir } from "../config";
import { loadManifest, saveManifest, removeNode, findNode } from "../manifest";
import { runTerraform, cleanupNodeDirectory } from "../terraform";
import { exitWithError } from "../utils";
import { getProvider } from "../providers";
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
        exitWithError("No configuration found. Run 'burrow init' first.", json);
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

function getEnvVarsForProvider(
  providerName: string,
  config: NonNullable<ReturnType<typeof loadConfig>>
): Record<string, string> {
  const provider = getProvider(providerName);
  const providerConfig = config.providers[providerName];
  if (!provider || !providerConfig) return {};
  return provider.buildEnvVars(providerConfig);
}

function getTerraformVarsForProvider(
  providerName: string,
  config: NonNullable<ReturnType<typeof loadConfig>>
): Record<string, string> {
  const provider = getProvider(providerName);
  const providerConfig = config.providers[providerName];
  if (!provider || !providerConfig) return {};
  return provider.buildTerraformVars(providerConfig);
}

async function handleRemoveSingle(
  manifest: ReturnType<typeof loadManifest>,
  config: NonNullable<ReturnType<typeof loadConfig>>,
  providerName: string,
  region: string,
  autoApprove: boolean,
  json: boolean
): Promise<void> {
  const node = findNode(manifest, providerName, region);
  if (!node) {
    exitWithError(`No exit node found: ${providerName}/${region}`, json);
  }

  const nodesDir = getNodesDir();
  const nodeDir = join(nodesDir, node.directory);

  const envVars = getEnvVarsForProvider(providerName, config);
  const providerVars = getTerraformVarsForProvider(providerName, config);
  const vars = { tailscale_auth_key: config.tailscale.authKey, ...providerVars };

  if (!json) console.log(`\nDestroying exit node ${providerName}/${region}...`);

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

  const updated = removeNode(manifest, providerName, region);
  saveManifest(updated);
  cleanupNodeDirectory(nodeDir);

  if (json) {
    console.log(JSON.stringify({ status: "ok", provider: providerName, region }));
  } else {
    console.log(`\n✓ Exit node removed: ${providerName}/${region}`);
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

    const envVars = getEnvVarsForProvider(node.provider, config);
    const providerVars = getTerraformVarsForProvider(node.provider, config);
    const vars = { tailscale_auth_key: config.tailscale.authKey, ...providerVars };

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
