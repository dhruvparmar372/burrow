variable "aws_region" {
  type = string
}

variable "aws_instance_ami_id" {
  type = string
}

variable "aws_instance_type" {
  type = string
  default = "t3.nano"
}

variable "tailscale_auth_key" {
  type = string
}