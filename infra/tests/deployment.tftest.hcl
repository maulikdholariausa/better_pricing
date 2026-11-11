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
    condition     = aws_volume_attachment.data.stop_instance_before_detaching
    error_message = "Stop EC2 cleanly before detaching the database disk on future replacements."
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

mock_provider "aws" { alias = "edge" }
override_data {
  target = data.aws_ssm_parameter.notify
  values = { value = "{\"notify_configuration_id\":\"nc-test\",\"notify_code_configuration_id\":\"ncc-test\"}" }
}
run "cloudfront_plan" {
  command = plan
  variables {
    domain            = "quotes.example.com"
    enable_cloudfront = true
  }
  assert {
    condition     = alltrue([for bucket in aws_s3_bucket_public_access_block.environment_quotes : bucket.block_public_policy && bucket.block_public_acls])
    error_message = "Quote documents must never be public."
  }
  assert {
    condition     = aws_cloudfront_distribution.app[0].web_acl_id == aws_wafv2_web_acl.edge.arn
    error_message = "CloudFront must use the WAF protections."
  }
  assert {
    condition     = aws_instance.app.metadata_options[0].http_put_response_hop_limit == 2
    error_message = "The Docker app needs IMDSv2 credentials through its instance role."
  }
}
override_resource {
  target          = aws_wafv2_web_acl.edge
  override_during = plan
  values          = { arn = "arn:aws:wafv2:us-east-1:000000000000:global/webacl/test/00000000-0000-0000-0000-000000000000" }
}
