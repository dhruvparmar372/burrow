// src/commands/add.ts
import { Command } from "commander";
import { loadConfig } from "../config";
import type { AwsProviderConfig } from "../config";
import { loadManifest, saveManifest, addNode, findNode } from "../manifest";
import {
  checkTerraformInstalled,
  generateAwsTerraformFiles,
  createNodeDirectory,
  writeTerraformFiles,
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
        exitWithError("No configuration found. Run 'burrow config' first.", json);
      }

      // 3. Validate provider
      if (provider !== "aws") {
        exitWithError(`Unknown provider: ${provider}. Currently only 'aws' is supported.`, json);
      }

      // 4. Check for provider config
      const providerConfig = config.providers[provider as keyof typeof config.providers];
      if (!providerConfig) {
        exitWithError(`Provider '${provider}' is not configured. Run 'burrow config' first.`, json);
      }

      // 5. Check duplicates
      const manifest = loadManifest();
      if (findNode(manifest, provider, region)) {
        exitWithError(`Exit node already exists: ${provider}/${region}`, json);
      }

      // 6. Generate terraform files
      let tfFiles: Record<string, string>;
      if (provider === "aws") {
        tfFiles = generateAwsTerraformFiles(region);
      } else {
        exitWithError(`Provider '${provider}' is not yet implemented.`, json);
      }

      const nodeDir = createNodeDirectory(provider, region);
      writeTerraformFiles(nodeDir, tfFiles);

      // 7. Build env vars
      const envVars = provider === "aws" ? buildAwsEnvVars(providerConfig as AwsProviderConfig) : {};
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
