provider "aws" {
  alias  = "edge"
  region = "us-east-1"
}
variable "enable_cloudfront" {
  description = "Enable after adding the ACM validation CNAME and origin A record from outputs."
  type        = bool
  default     = false
}
variable "restrict_origin_to_cloudfront" {
  description = "Enable after DNS cutover and successful CloudFront checks. Blocks direct access to EC2."
  type        = bool
  default     = false
}
resource "random_password" "origin" {
  length  = 48
  special = false
}
resource "aws_acm_certificate" "edge" {
  provider                  = aws.edge
  domain_name               = var.domain
  subject_alternative_names = ["www.${var.domain}"]
  validation_method         = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}
resource "aws_acm_certificate_validation" "edge" {
  count                   = var.enable_cloudfront ? 1 : 0
  provider                = aws.edge
  certificate_arn         = aws_acm_certificate.edge.arn
  validation_record_fqdns = [for option in aws_acm_certificate.edge.domain_validation_options : option.resource_record_name]
}
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}
resource "aws_wafv2_web_acl" "edge" {
  provider = aws.edge
  name     = "${var.project_name}-edge"
  scope    = "CLOUDFRONT"
  default_action {
    allow {
    }
  }
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "guru-edge"
    sampled_requests_enabled   = false
  }
  rule {
    name     = "common-threats"
    priority = 0
    override_action {
      none {
      }
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
        # Multipart attachments exceed the body-inspection window. Size is enforced by the app.
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "guru-common"
      sampled_requests_enabled   = false
    }
  }
  rule {
    name     = "ip-reputation"
    priority = 1
    override_action {
      none {
      }
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "guru-reputation"
      sampled_requests_enabled   = false
    }
  }
  rule {
    name     = "api-rate"
    priority = 2
    action {
      block {
      }
    }
    statement {
      rate_based_statement {
        limit                 = 100
        evaluation_window_sec = 60
        aggregate_key_type    = "IP"
        scope_down_statement {
          byte_match_statement {
            search_string         = "/api/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {
              }
            }
            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "guru-api-rate"
      sampled_requests_enabled   = false
    }
  }
  rule {
    name     = "site-rate"
    priority = 3
    action {
      block {
      }
    }
    statement {
      rate_based_statement {
        limit                 = 1000
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "guru-site-rate"
      sampled_requests_enabled   = false
    }
  }
}
data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}
resource "aws_cloudfront_cache_policy" "public" {
  name        = "${var.project_name}-public"
  min_ttl     = 0
  default_ttl = 60
  max_ttl     = 300
  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config { cookie_behavior = "none" }
    query_strings_config { query_string_behavior = "none" }
    headers_config { header_behavior = "none" }
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
  }
}
data "aws_cloudfront_origin_request_policy" "api" {
  name = "Managed-AllViewerExceptHostHeader"
}
resource "aws_cloudfront_distribution" "app" {
  count       = var.enable_cloudfront ? 1 : 0
  enabled     = true
  aliases     = [var.domain, "www.${var.domain}"]
  price_class = "PriceClass_100"
  web_acl_id  = aws_wafv2_web_acl.edge.arn
  origin {
    domain_name = "origin.${var.domain}"
    origin_id   = "ec2"
    custom_header {
      name  = "X-Guru-Origin"
      value = random_password.origin.result
    }
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
  default_cache_behavior {
    target_origin_id       = "ec2"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    # No private responses use this public behavior; deployment invalidates the short public cache.
    cache_policy_id = aws_cloudfront_cache_policy.public.id
    compress        = true
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.canonical.arn
    }
  }
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "ec2"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.api.id
    compress                 = true
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.canonical.arn
    }
  }
  dynamic "ordered_cache_behavior" {
    for_each = ["/profile*", "/verify*"]
    content {
      path_pattern           = ordered_cache_behavior.value
      target_origin_id       = "ec2"
      viewer_protocol_policy = "https-only"
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
      cached_methods         = ["GET", "HEAD"]
      cache_policy_id        = data.aws_cloudfront_cache_policy.disabled.id
    }
  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.edge[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
output "certificate_dns_records" {
  value = [for option in aws_acm_certificate.edge.domain_validation_options : {
    name  = option.resource_record_name,
    type  = option.resource_record_type,
    value = option.resource_record_value
    }
  ]
}
output "origin_dns_record" {
  value = {
    name  = "origin",
    type  = "A",
    value = aws_eip.app.public_ip
  }
}
output "cloudfront_domain" {
  value = try(aws_cloudfront_distribution.app[0].domain_name, null)
}
resource "aws_cloudfront_function" "canonical" {
  name    = "${var.project_name}-canonical"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      if (request.headers.host.value === 'www.${var.domain}') {
        var query = [];
        for (var key in request.querystring) {
          var field = request.querystring[key];
          var values = field.multiValue || [field];
          for (var i = 0; i < values.length; i++) query.push(key + '=' + values[i].value);
        }
        return {statusCode: 308, statusDescription: 'Permanent Redirect', headers: {location: {value: 'https://${var.domain}' + request.uri + (query.length ? '?' + query.join('&') : '')}}};
      }
      request.headers['x-guru-viewer-ip'] = {value: event.viewer.ip};
      return request;
    }
  JS
}

output "cloudfront_distribution_id" { value = try(aws_cloudfront_distribution.app[0].id, null) }

resource "aws_route53_record" "origin" {
  count   = var.route53_zone_id == null ? 0 : 1
  zone_id = var.route53_zone_id
  name    = "origin.${var.domain}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.app.public_ip]
}
resource "aws_route53_record" "certificate" {
  for_each = var.route53_zone_id == null ? {} : { for option in aws_acm_certificate.edge.domain_validation_options : option.domain_name => option }
  zone_id  = var.route53_zone_id
  name     = each.value.resource_record_name
  type     = each.value.resource_record_type
  ttl      = 300
  records  = [each.value.resource_record_value]
}
