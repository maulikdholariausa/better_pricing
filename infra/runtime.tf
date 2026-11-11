data "aws_caller_identity" "current" {}

resource "aws_ssm_parameter" "runtime" {
  name = "/${var.project_name}/runtime"
  type = "SecureString"
  value = jsonencode({
    APP_ENV                      = "prod"
    QUOTES_PREFIX                = "quotes-prod"
    AWS_REGION                   = var.aws_region
    QUOTES_BUCKET                = aws_s3_bucket.environment_quotes["prod"].id
    NOTIFY_CONFIGURATION_ID      = local.notify.notify_configuration_id
    NOTIFY_CODE_CONFIGURATION_ID = local.notify.notify_code_configuration_id
    SMS_MONTHLY_SEND_LIMIT       = "400"
    ORIGIN_HOST                  = "origin.${var.domain}"
    ORIGIN_SECRET                = random_password.origin.result
    REQUIRE_CLOUDFRONT           = tostring(var.restrict_origin_to_cloudfront)
  })
}
resource "aws_iam_role_policy" "quotes" {
  role = aws_iam_role.app.id
  name = "quote-uploads-and-verification"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:ListBucketVersions"], Resource = aws_s3_bucket.environment_quotes["prod"].arn, Condition = { StringLike = { "s3:prefix" = "quotes-prod/*" } } },
      { Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObjectVersion"], Resource = "${aws_s3_bucket.environment_quotes["prod"].arn}/quotes-prod/*" },
      { Effect = "Allow", Action = ["end-user-messaging:SendNotifyCodeVerification"], Resource = "arn:aws:end-user-messaging:${var.aws_region}:${data.aws_caller_identity.current.account_id}:notify-code-configuration/${local.notify.notify_code_configuration_id}" },
      { Effect = "Allow", Action = ["end-user-messaging:ValidateNotifyCodeVerification"], Resource = "*" },
      { Effect = "Allow", Action = ["sms-voice:SendNotifyTextMessage"], Resource = "arn:aws:sms-voice:${var.aws_region}:${data.aws_caller_identity.current.account_id}:notify-configuration/${local.notify.notify_configuration_id}" },
      { Effect = "Allow", Action = ["ssm:GetParameter"], Resource = aws_ssm_parameter.runtime.arn }
    ]
  })
}
