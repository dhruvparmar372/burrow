terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.41"
    }
  }
}

provider "aws" {
  region = var.aws_region
  profile = "dhruv-dev"
}


resource "aws_instance" "ts-exit-node-uae" {
  ami = var.aws_instance_ami_id
  instance_type = var.aws_instance_type
  associate_public_ip_address = true
  
  user_data = templatefile("user_data.tftpl", {
    tailscale_auth_key = var.tailscale_auth_key,
    tailscale_hostname = "TSExitNode-${var.aws_region}"
  })
  
  tags = {
    Name = "TSExitNode-${var.aws_region}"
  }
}