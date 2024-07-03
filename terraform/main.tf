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

resource "aws_iam_role" "ec2_ssm_role" {
  name = "ec2-ssm-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "ec2.amazonaws.com"
        },
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_policy_attachment" {
  role = aws_iam_role.ec2_ssm_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_ssm_instance_profile" {
  name = "ec2-ssm-instance-profile"
  role = aws_iam_role.ec2_ssm_role.name
}

resource "aws_instance" "ts-exit-node" {
  ami = lookup(var.aws_instance_ami_id, var.aws_region, "")
  instance_type = var.aws_instance_type
  associate_public_ip_address = true
  
  iam_instance_profile = aws_iam_instance_profile.ec2_ssm_instance_profile.name

  metadata_options {
    http_tokens = "required"
  }
  
  user_data = templatefile("user_data.tftpl", {
    tailscale_auth_key = var.tailscale_auth_key,
    tailscale_hostname = "TSExitNode-${var.aws_region}"
  })
  
  tags = {
    Name = "TSExitNode-${var.aws_region}"
  }
}