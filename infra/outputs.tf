output "url" {
  value = "https://${var.domain}"
}
output "public_ip" {
  description = "Point the domain A record here if Route 53 is not managed by this configuration."
  value       = aws_eip.app.public_ip
}
output "instance_id" {
  value = aws_instance.app.id
}
output "ssm_command" {
  value = "aws ssm start-session --region ${var.aws_region} --target ${aws_instance.app.id}"
}
output "data_volume_id" {
  value = aws_ebs_volume.data.id
}
