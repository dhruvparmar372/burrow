#!make

include .env
export

init:
	cd terraform; terraform init

me-central-1-start: init
	cd terraform; terraform apply -var "aws_region=me-central-1" -var "tailscale_auth_key=$$TAILSCALE_AUTH_KEY"

me-central-1-stop: init
	cd terraform; terraform destroy -var "aws_region=me-central-1" -var "tailscale_auth_key=$$TAILSCALE_AUTH_KEY"

ap-south-1-start: init
	cd terraform; terraform apply -var "aws_region=ap-south-1" -var "tailscale_auth_key=$$TAILSCALE_AUTH_KEY"

ap-south-1-stop: init
	cd terraform; terraform destroy -var "aws_region=ap-south-1" -var "tailscale_auth_key=$$TAILSCALE_AUTH_KEY"