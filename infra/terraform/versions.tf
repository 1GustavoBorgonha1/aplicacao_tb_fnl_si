terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.7" }
  }
  backend "s3" {}
}
provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
  default_tags {
    tags = { Project = var.project_name, ManagedBy = "Terraform", Purpose = "classroom" }
  }
}
