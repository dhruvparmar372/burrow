import { describe, test, expect } from "bun:test";
import { getProvider, getAllProviderNames } from "../src/providers";

describe("provider registry", () => {
  test("getProvider returns a provider for 'aws'", () => {
    const provider = getProvider("aws");
    expect(provider).toBeDefined();
    expect(provider!.name).toBe("aws");
  });

  test("getProvider returns a provider for 'hetzner'", () => {
    const provider = getProvider("hetzner");
    expect(provider).toBeDefined();
    expect(provider!.name).toBe("hetzner");
  });

  test("getProvider returns a provider for 'gcp'", () => {
    const provider = getProvider("gcp");
    expect(provider).toBeDefined();
    expect(provider!.name).toBe("gcp");
  });

  test("getProvider returns undefined for unknown provider", () => {
    const provider = getProvider("azure");
    expect(provider).toBeUndefined();
  });

  test("getAllProviderNames returns all registered providers", () => {
    const names = getAllProviderNames();
    expect(names).toContain("aws");
    expect(names).toContain("hetzner");
    expect(names).toContain("gcp");
    expect(names.length).toBe(3);
  });
});

describe("aws provider", () => {
  const provider = getProvider("aws")!;

  test("generateTerraformFiles produces valid HCL for any region", () => {
    const files = provider.generateTerraformFiles("us-east-1");
    const hcl = files["main.tf"];
    expect(hcl).toContain('source  = "hashicorp/aws"');
    expect(hcl).toContain('region = "us-east-1"');
    expect(hcl).toContain("aws_ssm_parameter");
    expect(hcl).toContain("tailscale_auth_key");
    expect(hcl).toContain("sensitive = true");
  });

  test("generateTerraformFiles uses SSM data source for AMI", () => {
    const files = provider.generateTerraformFiles("eu-west-1");
    const hcl = files["main.tf"];
    expect(hcl).toContain("data.aws_ssm_parameter.ubuntu_ami.value");
  });

  test("generateTerraformFiles includes user_data template", () => {
    const files = provider.generateTerraformFiles("ap-south-1");
    expect(files["user_data.tftpl"]).toContain("tailscale up");
  });

  test("buildEnvVars returns AWS credential env vars", () => {
    const env = provider.buildEnvVars({
      accessKeyId: "AKIATEST",
      secretAccessKey: "secret123",
    });
    expect(env.AWS_ACCESS_KEY_ID).toBe("AKIATEST");
    expect(env.AWS_SECRET_ACCESS_KEY).toBe("secret123");
  });

  test("validateConfig returns errors for missing credentials", () => {
    expect(provider.validateConfig({}).length).toBeGreaterThan(0);
    expect(provider.validateConfig({ accessKeyId: "x" }).length).toBeGreaterThan(0);
    expect(provider.validateConfig({ accessKeyId: "x", secretAccessKey: "y" })).toEqual([]);
  });

  test("redactConfig masks credential values", () => {
    const redacted = provider.redactConfig({
      accessKeyId: "AKIATESTLONG1234",
      secretAccessKey: "superSecretKeyValue1234",
    });
    expect(redacted.accessKeyId).not.toBe("AKIATESTLONG1234");
    expect(redacted.accessKeyId).toContain("****");
    expect(redacted.secretAccessKey).toContain("****");
  });
});

describe("hetzner provider", () => {
  const provider = getProvider("hetzner")!;

  test("generateTerraformFiles produces valid HCL for any location", () => {
    const files = provider.generateTerraformFiles("fsn1");
    const hcl = files["main.tf"];
    expect(hcl).toContain('source  = "hetznercloud/hcloud"');
    expect(hcl).toContain("hcloud_server");
    expect(hcl).toContain("tailscale_auth_key");
    expect(hcl).toContain("sensitive = true");
    expect(hcl).toContain("fsn1");
  });

  test("generateTerraformFiles includes cloud-init user data", () => {
    const files = provider.generateTerraformFiles("nbg1");
    const hcl = files["main.tf"];
    expect(hcl).toContain("tailscale up");
    expect(hcl).toContain("advertise-exit-node");
  });

  test("buildEnvVars returns HCLOUD_TOKEN", () => {
    const env = provider.buildEnvVars({ apiToken: "test-token-123" });
    expect(env.HCLOUD_TOKEN).toBe("test-token-123");
  });

  test("validateConfig returns errors for missing token", () => {
    expect(provider.validateConfig({}).length).toBeGreaterThan(0);
    expect(provider.validateConfig({ apiToken: "tok" })).toEqual([]);
  });

  test("redactConfig masks token", () => {
    const redacted = provider.redactConfig({ apiToken: "hc-token-very-long-value" });
    expect(redacted.apiToken).toContain("****");
    expect(redacted.apiToken).not.toBe("hc-token-very-long-value");
  });
});

describe("gcp provider", () => {
  const provider = getProvider("gcp")!;

  test("generateTerraformFiles produces valid HCL for any zone", () => {
    const files = provider.generateTerraformFiles("us-central1-a");
    const hcl = files["main.tf"];
    expect(hcl).toContain('source  = "hashicorp/google"');
    expect(hcl).toContain("google_compute_instance");
    expect(hcl).toContain("tailscale_auth_key");
    expect(hcl).toContain("sensitive = true");
    expect(hcl).toContain("us-central1-a");
  });

  test("generateTerraformFiles includes startup script with tailscale", () => {
    const files = provider.generateTerraformFiles("europe-west1-b");
    const hcl = files["main.tf"];
    expect(hcl).toContain("tailscale up");
    expect(hcl).toContain("advertise-exit-node");
  });

  test("buildEnvVars returns GOOGLE_CREDENTIALS", () => {
    const env = provider.buildEnvVars({
      credentialsJson: '{"type":"service_account"}',
      projectId: "my-project",
    });
    expect(env.GOOGLE_CREDENTIALS).toBe('{"type":"service_account"}');
  });

  test("validateConfig returns errors for missing fields", () => {
    expect(provider.validateConfig({}).length).toBeGreaterThan(0);
    expect(provider.validateConfig({ credentialsJson: "{}", projectId: "" }).length).toBeGreaterThan(0);
    expect(provider.validateConfig({ credentialsJson: "{}", projectId: "proj" })).toEqual([]);
  });

  test("redactConfig masks credentials JSON", () => {
    const redacted = provider.redactConfig({
      credentialsJson: '{"type":"service_account","private_key":"..."}',
      projectId: "my-project-123",
    });
    expect(redacted.credentialsJson).toContain("****");
    expect(redacted.projectId).toBe("my-project-123");
  });
});
