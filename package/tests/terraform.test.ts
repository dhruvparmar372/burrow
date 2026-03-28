import { describe, test, expect } from "bun:test";
import { getProvider } from "../src/providers";

const awsProvider = getProvider("aws")!;

describe("terraform (aws)", () => {
  test("generateTerraformFiles produces valid HCL for any region", () => {
    const files = awsProvider.generateTerraformFiles("us-east-1");
    const hcl = files["main.tf"];
    expect(hcl).toContain('source  = "hashicorp/aws"');
    expect(hcl).toContain('region = "us-east-1"');
    expect(hcl).toContain("aws_ssm_parameter");
    expect(hcl).toContain("/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id");
    expect(hcl).toContain("tailscale_auth_key");
    expect(hcl).toContain("sensitive = true");
  });

  test("generateTerraformFiles uses SSM data source for AMI", () => {
    const files = awsProvider.generateTerraformFiles("eu-west-1");
    const hcl = files["main.tf"];
    expect(hcl).toContain("data.aws_ssm_parameter.ubuntu_ami.value");
    expect(hcl).not.toContain("aws_instance_ami_id");
  });

  test("generateTerraformFiles includes user_data template", () => {
    const files = awsProvider.generateTerraformFiles("ap-south-1");
    expect(files["user_data.tftpl"]).toContain("tailscale up");
  });
});
