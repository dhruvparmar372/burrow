import { Command } from "commander";
import { loadConfig, saveConfig } from "../config";
import { loadManifest, saveManifest, addNode, findNode } from "../manifest";
import {
  checkTerraformInstalled,
  createNodeDirectory,
  writeTerraformFiles,
  cleanupNodeDirectory,
  runTerraform,
} from "../terraform";
import { exitWithError } from "../utils";
import { getProvider, getAllProviderNames } from "../providers";

export function createAddCommand(): Command {
  const cmd = new Command("add")
    .description("Deploy a new Tailscale exit node")
    .requiredOption("--region <region>", "Cloud provider region")
    .option("--provider <provider>", "Cloud provider", "aws")
    .option("--no-auto-approve", "Require Terraform confirmation prompt")
    .option("--json", "Output result as JSON")
    .action(async (opts) => {
      const { provider: providerName, region, autoApprove, json } = opts;

      // 1. Check terraform
      if (!checkTerraformInstalled()) {
        exitWithError("terraform is not installed or not on PATH. Install from https://developer.hashicorp.com/terraform/install", json);
      }

      // 2. Check config
      const config = loadConfig();
      if (!config) {
        exitWithError("No configuration found. Run 'burrow init' first.", json);
      }

      // 3. Validate provider
      const provider = getProvider(providerName);
      if (!provider) {
        const supported = getAllProviderNames().join(", ");
        exitWithError(`Unknown provider: ${providerName}. Supported: ${supported}`, json);
      }

      // 4. Check for provider config — prompt if missing
      let providerConfig = config.providers[providerName];
      if (!providerConfig) {
        if (json) {
          exitWithError(`Provider '${providerName}' is not configured. Run 'burrow add --provider ${providerName} --region <region>' interactively first.`, json);
        }
        console.log(`\n${provider.displayName} is not configured yet. Let's set it up.\n`);
        providerConfig = await provider.promptForCredentials();
        const errors = provider.validateConfig(providerConfig);
        if (errors.length > 0) {
          exitWithError(errors.join("; "), json);
        }
        config.providers[providerName] = providerConfig;
        saveConfig(config);
        console.log(`\n✓ ${provider.displayName} credentials saved.\n`);
      }

      // 5. Check duplicates
      const manifest = loadManifest();
      if (findNode(manifest, providerName, region)) {
        exitWithError(`Exit node already exists: ${providerName}/${region}`, json);
      }

      // 6. Generate terraform files
      const tfFiles = provider.generateTerraformFiles(region);
      const nodeDir = createNodeDirectory(providerName, region);
      writeTerraformFiles(nodeDir, tfFiles);

      // 7. Build env vars and terraform vars
      const envVars = provider.buildEnvVars(providerConfig);
      const providerVars = provider.buildTerraformVars(providerConfig);
      const vars = { tailscale_auth_key: config.tailscale.authKey, ...providerVars };

      // 8. terraform init
      if (!json) console.log(`\nInitializing Terraform for ${providerName}/${region}...`);
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
      if (!json) console.log(`\nDeploying exit node in ${providerName}/${region}...`);
      const applyCode = await runTerraform({
        command: "apply",
        cwd: nodeDir,
        autoApprove,
        vars,
        envVars,
        jsonMode: json,
      });
      if (applyCode !== 0) {
        exitWithError(`terraform apply failed. State preserved in nodes/${providerName}-${region}/ for debugging.`, json);
      }

      // 10. Update manifest
      const updated = addNode(manifest, providerName, region);
      saveManifest(updated);

      const directory = `${providerName}-${region}`;
      if (json) {
        console.log(JSON.stringify({ status: "ok", provider: providerName, region, directory }));
      } else {
        console.log(`\n✓ Exit node deployed: ${providerName}/${region}`);
      }
    });

  return cmd;
}
