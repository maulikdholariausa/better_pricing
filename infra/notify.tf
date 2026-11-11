variable "sms_monthly_spend_limit" {
  type    = number
  default = 25
  validation {
    condition     = var.sms_monthly_spend_limit >= 1 && var.sms_monthly_spend_limit <= 100
    error_message = "Use a monthly SMS ceiling between 1 and 100 USD."
  }
}
resource "terraform_data" "notify" {
  triggers_replace = [filesha256("${path.module}/scripts/configure-notify.mjs"), var.aws_region, var.project_name, tostring(var.sms_monthly_spend_limit)]
  provisioner "local-exec" {
    command     = "node scripts/configure-notify.mjs '${var.aws_region}' '${var.project_name}' '${var.sms_monthly_spend_limit}'"
    working_dir = path.module
  }
}
data "aws_ssm_parameter" "notify" {
  name       = "/${var.project_name}/notify"
  depends_on = [terraform_data.notify]
}
locals {
  notify = jsondecode(nonsensitive(data.aws_ssm_parameter.notify.value))
}
output "notify_configuration_id" {
  value = local.notify.notify_configuration_id
}
