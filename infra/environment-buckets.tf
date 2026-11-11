variable "quote_bucket_names" {
  description = "A separate private S3 bucket for each application environment."
  type        = map(string)
  default = {
    dev     = "haveaguru-quotes-dev"
    staging = "haveaguru-quotes-staging"
    prod    = "haveaguru-quotes-prod"
  }
  validation {
    condition     = toset(keys(var.quote_bucket_names)) == toset(["dev", "staging", "prod"]) && length(toset(values(var.quote_bucket_names))) == 3
    error_message = "Provide three distinct bucket names keyed dev, staging and prod."
  }
}
resource "aws_s3_bucket" "environment_quotes" {
  for_each      = var.quote_bucket_names
  bucket        = each.value
  force_destroy = false
  lifecycle {
    prevent_destroy = true
  }
}
resource "aws_s3_bucket_public_access_block" "environment_quotes" {
  for_each                = var.quote_bucket_names
  bucket                  = aws_s3_bucket.environment_quotes[each.key].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "environment_quotes" {
  for_each = var.quote_bucket_names
  bucket   = aws_s3_bucket.environment_quotes[each.key].id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "environment_quotes" {
  for_each = var.quote_bucket_names
  bucket   = aws_s3_bucket.environment_quotes[each.key].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_versioning" "environment_quotes" {
  for_each = var.quote_bucket_names
  bucket   = aws_s3_bucket.environment_quotes[each.key].id
  versioning_configuration {
    status = "Enabled"
  }
}
resource "aws_s3_bucket_policy" "environment_quotes" {
  for_each = var.quote_bucket_names
  bucket   = aws_s3_bucket.environment_quotes[each.key].id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Sid       = "RequireTLS",
      Effect    = "Deny",
      Principal = "*",
      Action    = "s3:*",
      Resource  = [aws_s3_bucket.environment_quotes[each.key].arn, "${aws_s3_bucket.environment_quotes[each.key].arn}/*"],
      Condition = {
        Bool = {
          "aws:SecureTransport" = "false"
        }
      }
      }
    ]
    }
  )
}
resource "aws_s3_bucket_lifecycle_configuration" "environment_quotes" {
  for_each = var.quote_bucket_names
  bucket   = aws_s3_bucket.environment_quotes[each.key].id
  rule {
    id     = "unfinished-multipart"
    status = "Enabled"
    filter {
      prefix = ""
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
output "quotes_buckets" {
  value = { for environment, bucket in aws_s3_bucket.environment_quotes : environment => bucket.id }
}

output "quotes_bucket" {
  description = "Production bucket; quotes_buckets lists all three environments."
  value       = aws_s3_bucket.environment_quotes["prod"].id
}
