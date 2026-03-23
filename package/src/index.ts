#!/usr/bin/env bun
import { Command } from "commander";
import { createInitCommand } from "./commands/init";
import { createConfigCommand } from "./commands/config";
import { createAddCommand } from "./commands/add";
import { createListCommand } from "./commands/list";
import { createRemoveCommand } from "./commands/remove";

const program = new Command();

program
  .name("burrow")
  .description("Self-hosted VPN — deploy Tailscale exit nodes anywhere")
  .version("0.1.0");

program.addCommand(createInitCommand());
program.addCommand(createConfigCommand());
program.addCommand(createAddCommand());
program.addCommand(createListCommand());
program.addCommand(createRemoveCommand());

program.parse();
