data "aws_availability_zones" "available" {
  state = "available"
}
data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}
data "aws_ec2_instance_type" "app" {
  instance_type = var.instance_type
}
locals {
  az = coalesce(var.availability_zone, data.aws_availability_zones.available.names[0])
}
resource "aws_vpc" "app" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = var.project_name }
}
resource "aws_internet_gateway" "app" {
  vpc_id = aws_vpc.app.id
}
resource "aws_subnet" "app" {
  vpc_id                  = aws_vpc.app.id
  cidr_block              = "10.42.1.0/24"
  availability_zone       = local.az
  map_public_ip_on_launch = true
}
resource "aws_route_table" "app" {
  vpc_id = aws_vpc.app.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.app.id
  }
}
resource "aws_route_table_association" "app" {
  subnet_id      = aws_subnet.app.id
  route_table_id = aws_route_table.app.id
}
resource "aws_security_group" "app" {
  name_prefix = "${var.project_name}-"
  description = "Public web only; administration uses SSM, with no SSH ingress"
  vpc_id      = aws_vpc.app.id
  ingress {
    description = "HTTP and certificate validation"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description     = "HTTPS"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    cidr_blocks     = var.restrict_origin_to_cloudfront ? [] : ["0.0.0.0/0"]
    prefix_list_ids = var.restrict_origin_to_cloudfront ? [data.aws_ec2_managed_prefix_list.cloudfront.id] : []
  }
  egress {
    description = "Package downloads, SSM, S3 and certificate renewal"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_iam_role" "app" {
  name_prefix = "${var.project_name}-"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_instance_profile" "app" {
  name_prefix = "${var.project_name}-"
  role        = aws_iam_role.app.name
}
resource "aws_ebs_volume" "data" {
  availability_zone = local.az
  size              = var.data_volume_gb
  type              = "gp3"
  encrypted         = true
  tags              = { Name = "${var.project_name}-data" }
  lifecycle {
    prevent_destroy = true
  }
}
resource "aws_instance" "app" {
  ami                         = coalesce(var.ami_id, data.aws_ssm_parameter.ubuntu.value)
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.app.id
  vpc_security_group_ids      = [aws_security_group.app.id]
  iam_instance_profile        = aws_iam_instance_profile.app.name
  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    runtime_parameter = "/${var.project_name}/runtime"
    aws_region        = var.aws_region
    domain            = var.domain
    repository        = var.github_repository
    volume_id         = aws_ebs_volume.data.id
    deploy_script     = filebase64("${path.module}/scripts/deploy-app.sh")
  })
  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 2
  }
  root_block_device {
    volume_size           = 20
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }
  tags       = { Name = var.project_name }
  depends_on = [aws_route_table_association.app, aws_iam_role_policy_attachment.ssm, aws_iam_role_policy.quotes]
  lifecycle {
    precondition {
      condition     = !var.restrict_origin_to_cloudfront || var.enable_cloudfront
      error_message = "Enable and test CloudFront before restricting direct origin access."
    }
    precondition {
      condition     = contains(data.aws_ec2_instance_type.app.supported_architectures, "x86_64")
      error_message = "Choose an x86_64 instance type; this configuration uses an amd64 Ubuntu AMI."
    }
  }
}
resource "aws_volume_attachment" "data" {
  device_name                    = "/dev/sdf"
  volume_id                      = aws_ebs_volume.data.id
  instance_id                    = aws_instance.app.id
  stop_instance_before_detaching = true
}
resource "aws_eip" "app" {
  domain = "vpc"
}
resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}
resource "aws_route53_record" "app" {
  count   = var.route53_zone_id == null ? 0 : 1
  zone_id = var.route53_zone_id
  name    = var.domain
  type    = "A"
  ttl     = var.enable_cloudfront ? null : 300
  records = var.enable_cloudfront ? null : [aws_eip.app.public_ip]
  dynamic "alias" {
    for_each = var.enable_cloudfront ? [1] : []
    content {
      name                   = aws_cloudfront_distribution.app[0].domain_name
      zone_id                = aws_cloudfront_distribution.app[0].hosted_zone_id
      evaluate_target_health = false
    }
  }
}
resource "aws_route53_record" "www" {
  count   = var.route53_zone_id == null ? 0 : 1
  zone_id = var.route53_zone_id
  name    = "www.${var.domain}"
  type    = "CNAME"
  ttl     = 300
  records = [var.domain]
}
