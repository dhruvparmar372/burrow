output "instance_id" {
  value = aws_instance.ts_exit_node.id
}

output "public_ip" {
  value = aws_instance.ts_exit_node.public_ip
}
