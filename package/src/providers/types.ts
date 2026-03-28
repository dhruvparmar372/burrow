export interface Provider {
  /** Short name used in CLI flags and config: "aws", "hetzner", "gcp" */
  name: string;
  /** Human-readable name for display: "AWS", "Hetzner Cloud", "Google Cloud" */
  displayName: string;
  /** Generate Terraform HCL files for the given region */
  generateTerraformFiles(region: string): Record<string, string>;
  /** Build environment variables needed for terraform commands */
  buildEnvVars(config: Record<string, string>): Record<string, string>;
  /** Build terraform -var flags (beyond tailscale_auth_key which is always passed) */
  buildTerraformVars(config: Record<string, string>): Record<string, string>;
  /** Interactively prompt the user for provider credentials, returns config to save */
  promptForCredentials(existing?: Record<string, string>): Promise<Record<string, string>>;
  /** Validate provider config, return error messages (empty array = valid) */
  validateConfig(config: Record<string, string>): string[];
  /** Return a redacted version of the config for display */
  redactConfig(config: Record<string, string>): Record<string, string>;
}
