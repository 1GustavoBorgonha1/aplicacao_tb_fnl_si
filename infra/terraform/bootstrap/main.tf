terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.7" }
  }
}
variable "aws_region" {
  type    = string
  default = "us-east-2"
}
variable "aws_profile" {
  type    = string
  default = null
}
variable "project_name" {
  type    = string
  default = "marmifit"
}
variable "state_bucket_name" {
  type    = string
  default = null
}
provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}
resource "random_id" "suffix" { byte_length = 4 }
resource "aws_s3_bucket" "state" {
  bucket        = coalesce(var.state_bucket_name, "${var.project_name}-tfstate-${random_id.suffix.hex}")
  force_destroy = false
  lifecycle { prevent_destroy = true }
  tags = { Project = var.project_name, ManagedBy = "Terraform" }
}
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Sid       = "DenyInsecureTransport", Effect = "Deny", Principal = "*", Action = "s3:*",
    Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"],
    Condition = { Bool = { "aws:SecureTransport" = "false" } }
  }] })
}
output "state_bucket_name" { value = aws_s3_bucket.state.id }
