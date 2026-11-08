variable "aws_region" {
  description = "AWS deployment region. Authentication uses your local AWS profile or SSO session."
  type        = string
  default     = "us-west-2"
}
variable "project_name" {
  type    = string
  default = "contract-negotiations"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.project_name))
    error_message = "Use 3–31 lowercase letters, numbers and hyphens, starting with a letter."
  }
}
variable "domain" {
  description = "Public DNS hostname for this app, without https:// or a path."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.domain))
    error_message = "Provide a lowercase DNS hostname such as quotes.example.com."
  }
}
variable "route53_zone_id" {
  description = "Optional existing public Route 53 hosted zone. Null means configure the A record yourself."
  type        = string
  default     = null
}
variable "instance_type" {
  description = "An x86_64 instance type; the bootstrap and Ubuntu AMI target amd64."
  type        = string
  default     = "t3.small"
}
variable "availability_zone" {
  description = "Pin the AZ if desired. The data volume cannot move across AZs."
  type        = string
  default     = null
}
variable "data_volume_gb" {
  type    = number
  default = 30
  validation {
    condition     = var.data_volume_gb >= 10 && floor(var.data_volume_gb) == var.data_volume_gb
    error_message = "Use an integer of at least 10 GiB. Volumes can grow, not shrink."
  }
}
variable "ami_id" {
  description = "Optional pinned Ubuntu 24.04 amd64 AMI. Defaults to Canonical's regional SSM parameter."
  type        = string
  default     = null
}
variable "github_repository" {
  description = "GitHub owner/repository. EC2 receives a repository-scoped read-only deploy key."
  type        = string
  default     = "maulikdholariausa/better_pricing"
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Use owner/repository, without a URL or credentials."
  }
}
