variable "aws_region" {
  type = string
  
  validation {
    condition     = contains(["ap-south-1", "me-central-1"], var.aws_region)
    error_message = "Supported AWS regions are \"me-central-1\", \"ap-south-1\"."
  }
}

variable "aws_instance_ami_id" {
  type = map(string)
  default = {
    "ap-south-1" = "ami-007020fd9c84e18c7"
    "me-central-1" = "ami-04c9a1a3a1cdc1655"
  }
}

variable "aws_instance_type" {
  type = string
  default = "t3.nano"
}

variable "tailscale_auth_key" {
  type = string
  sensitive = true

  validation {
    condition     = length(var.tailscale_auth_key) > 0
    error_message = "Tailscale Auth Key is required."
  }
}