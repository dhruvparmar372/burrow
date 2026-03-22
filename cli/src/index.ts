#!/usr/bin/env bun
import { Command } from "commander";

const program = new Command();

program
  .name("scaletails")
  .description("Manage Tailscale exit nodes across cloud providers")
  .version("0.1.0");

program.parse();
