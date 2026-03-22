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
