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
  az       = coalesce(var.availability_zone, data.aws_availability_zones.available.names[0])
  app_root = abspath("${path.module}/..")
  source_files = concat(
    ["package.json", "package-lock.json", "server.js", "Dockerfile", "compose.yaml"],
    [for file in fileset("${path.module}/../backend", "**") : "backend/${file}"],
    [for file in fileset("${path.module}/../dist", "**") : "dist/${file}"],
    [for file in fileset("${path.module}/../deploy", "**") : "deploy/${file}"]
  )
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
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    description = "Package downloads, SSM, S3 and certificate renewal"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
# Only the application bundle uses S3. Customer files and SQLite stay on EBS.
resource "aws_s3_bucket" "releases" {
  bucket_prefix = "${var.project_name}-releases-"
  force_destroy = false
}
resource "aws_s3_bucket_public_access_block" "releases" {
  bucket                  = aws_s3_bucket.releases.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "releases" {
  bucket = aws_s3_bucket.releases.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_policy" "releases" {
  bucket = aws_s3_bucket.releases.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "RequireTLS", Effect = "Deny", Principal = "*", Action = "s3:*"
      Resource  = [aws_s3_bucket.releases.arn, "${aws_s3_bucket.releases.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}
data "archive_file" "app" {
  type        = "zip"
  output_path = "${path.module}/.build/app.zip"
  dynamic "source" {
    for_each = toset(local.source_files)
    content {
      filename = source.value
      content  = file("${local.app_root}/${source.value}")
    }
  }
}
resource "aws_s3_object" "release" {
  bucket                 = aws_s3_bucket.releases.id
  key                    = "releases/${data.archive_file.app.output_sha256}.zip"
  source                 = data.archive_file.app.output_path
  source_hash            = data.archive_file.app.output_sha256
  server_side_encryption = "AES256"
  depends_on             = [aws_s3_bucket_public_access_block.releases, aws_s3_bucket_server_side_encryption_configuration.releases]
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
resource "aws_iam_role_policy" "release" {
  role = aws_iam_role.app.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "s3:GetObject", Resource = "${aws_s3_bucket.releases.arn}/releases/*" }]
  })
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
    region      = var.aws_region
    domain      = var.domain
    bucket      = aws_s3_bucket.releases.id
    release_key = aws_s3_object.release.key
    release_sha = data.archive_file.app.output_sha256
    volume_id   = aws_ebs_volume.data.id
  })
  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 1
  }
  root_block_device {
    volume_size           = 20
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }
  tags       = { Name = var.project_name }
  depends_on = [aws_route_table_association.app, aws_iam_role_policy_attachment.ssm, aws_iam_role_policy.release]
  lifecycle {
    precondition {
      condition     = contains(data.aws_ec2_instance_type.app.supported_architectures, "x86_64")
      error_message = "Choose an x86_64 instance type; this configuration uses an amd64 AMI and AWS CLI."
    }
  }
}
resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.app.id
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
  ttl     = 300
  records = [aws_eip.app.public_ip]
}
resource "aws_route53_record" "www" {
  count   = var.route53_zone_id == null ? 0 : 1
  zone_id = var.route53_zone_id
  name    = "www.${var.domain}"
  type    = "CNAME"
  ttl     = 300
  records = [var.domain]
}
