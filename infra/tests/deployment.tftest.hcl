# Exercises the plan offline. The AWS provider is mocked; no account is contacted.
mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = { names = ["us-west-2a"] }
  }
  mock_data "aws_ssm_parameter" {
    defaults = { value = "ami-0123456789abcdef0" }
  }
  mock_data "aws_ec2_instance_type" {
    defaults = { supported_architectures = ["x86_64"] }
  }
}
run "single_instance_plan" {
  command = plan
  variables {
    domain         = "quotes.example.com"
    data_volume_gb = 30
  }
  assert {
    condition     = aws_ebs_volume.data.encrypted && aws_ebs_volume.data.size == 30
    error_message = "Customer data must use the separate encrypted data disk."
  }
  assert {
    condition     = aws_instance.app.metadata_options[0].http_tokens == "required"
    error_message = "EC2 must require IMDSv2."
  }
  assert {
    condition     = toset([for rule in aws_security_group.app.ingress : rule.from_port]) == toset([80, 443])
    error_message = "Only HTTP and HTTPS should be publicly exposed."
  }
  assert {
    condition     = !strcontains(file("${path.module}/main.tf"), "archive_file")
    error_message = "Application content must not be bundled into Terraform or EC2 user data."
  }
}
