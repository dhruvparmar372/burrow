import { Command } from "commander";
import { input, select, password } from "@inquirer/prompts";
import { loadConfig, saveConfig, validateConfig } from "../config";

export function createInitCommand(): Command {
  const cmd = new Command("init")
    .description("Set up Burrow with your credentials")
    .action(async () => {
      const existing = loadConfig() ?? { tailscale: { authKey: "" }, providers: {} };

      console.log("Welcome to Burrow! Let's get you set up.\n");

      const authKey = await password({
        message: "Tailscale Auth Key:",
        mask: "*",
        default: existing.tailscale.authKey || undefined,
      });
      existing.tailscale.authKey = authKey;

      const provider = await select({
        message: "Select cloud provider:",
        choices: [{ name: "AWS", value: "aws" }],
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
        console.error("\nValidation errors:");
        errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(1);
      }

      saveConfig(existing);
      console.log("\n✓ Configuration saved. You're ready to deploy!");
      console.log("  Run: burrow add --region <region>");
    });

  return cmd;
}
