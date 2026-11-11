terraform {
  required_version = ">= 1.7, < 2.0"
  required_providers {
    random = { source = "hashicorp/random"
      version = "~> 3.7"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
provider "aws" {
  region = var.aws_region
  default_tags {
    tags = { Project = var.project_name, ManagedBy = "Terraform" }
  }
}
