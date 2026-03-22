import { describe, test, expect } from "bun:test";
import { generateAwsRootConfig, getSupportedRegions } from "../src/terraform";

describe("terraform", () => {
  test("generateAwsRootConfig produces valid HCL for ap-south-1", () => {
    const hcl = generateAwsRootConfig("ap-south-1");
    expect(hcl).toContain('source  = "hashicorp/aws"');
    expect(hcl).toContain('region = "ap-south-1"');
    expect(hcl).toContain('source = "../../modules/aws-exit-node"');
    expect(hcl).toContain('aws_region         = "ap-south-1"');
    expect(hcl).toContain("tailscale_auth_key");
    expect(hcl).toContain("sensitive = true");
  });

  test("generateAwsRootConfig uses correct module path", () => {
    const hcl = generateAwsRootConfig("me-central-1");
    expect(hcl).toContain('source = "../../modules/aws-exit-node"');
    expect(hcl).toContain('region = "me-central-1"');
  });

  test("getSupportedRegions returns known AWS regions", () => {
    const regions = getSupportedRegions("aws");
    expect(regions).toContain("ap-south-1");
    expect(regions).toContain("me-central-1");
  });

  test("getSupportedRegions returns empty for unknown provider", () => {
    const regions = getSupportedRegions("gcp");
    expect(regions).toEqual([]);
  });
});
