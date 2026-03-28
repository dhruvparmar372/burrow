import { Command } from "commander";
import { password } from "@inquirer/prompts";
import { loadConfig, saveConfig, validateConfig } from "../config";

export function createInitCommand(): Command {
  const cmd = new Command("init")
    .description("Set up Burrow with your Tailscale auth key")
    .action(async () => {
      const existing = loadConfig() ?? { tailscale: { authKey: "" }, providers: {} };

      console.log("Welcome to Burrow! Let's get you set up.\n");

      const authKey = await password({
        message: "Tailscale Auth Key:",
        mask: "*",
        default: existing.tailscale.authKey || undefined,
      });
      existing.tailscale.authKey = authKey;

      const errors = validateConfig(existing);
      if (errors.length > 0) {
        console.error("\nValidation errors:");
        errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(1);
      }

      saveConfig(existing);
      console.log("\n✓ Configuration saved. You're ready to deploy!");
      console.log("  Run: burrow add --provider <aws|hetzner|gcp> --region <region>");
    });

  return cmd;
}
