#!/usr/bin/env bun
import { Command } from "commander";
import { createConfigCommand } from "./commands/config";
import { createAddCommand } from "./commands/add";
import { createListCommand } from "./commands/list";
import { createRemoveCommand } from "./commands/remove";

const program = new Command();

program
  .name("scaletails")
  .description("Manage Tailscale exit nodes across cloud providers")
  .version("0.1.0");

program.addCommand(createConfigCommand());
program.addCommand(createAddCommand());
program.addCommand(createListCommand());
program.addCommand(createRemoveCommand());

program.parse();
