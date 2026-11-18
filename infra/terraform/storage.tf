resource "random_id" "suffix" { byte_length = 4 }
resource "aws_s3_bucket" "images" {
  bucket        = coalesce(var.images_bucket_name, "${var.project_name}-images-${random_id.suffix.hex}")
  force_destroy = var.images_force_destroy
}
resource "aws_s3_bucket_ownership_controls" "images" {
  bucket = aws_s3_bucket.images.id
  rule { object_ownership = "BucketOwnerEnforced" }
}
resource "aws_s3_bucket_public_access_block" "images" {
  bucket                  = aws_s3_bucket.images.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}
resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_policy" "images" {
  bucket = aws_s3_bucket.images.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "PublicReadImages", Effect = "Allow", Principal = "*", Action = "s3:GetObject", Resource = "${aws_s3_bucket.images.arn}/meals/*" },
      { Sid = "DenyInsecureTransport", Effect = "Deny", Principal = "*", Action = "s3:*", Resource = [aws_s3_bucket.images.arn, "${aws_s3_bucket.images.arn}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } }
    ]
  })
  depends_on = [aws_s3_bucket_public_access_block.images]
}
resource "aws_s3_bucket_cors_configuration" "images" {
  bucket = aws_s3_bucket.images.id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT", "POST"]
    allowed_origins = distinct(concat(["http://${aws_lb.app.dns_name}"], var.images_cors_origins))
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}
resource "aws_s3_object" "schema" {
  count                  = var.db_schema_file == "" ? 0 : 1
  bucket                 = var.state_bucket_name
  key                    = "bootstrap/${var.project_name}/schema.sql"
  source                 = "${path.root}/${var.db_schema_file}"
  source_hash            = filesha256("${path.root}/${var.db_schema_file}")
  server_side_encryption = "AES256"
}
resource "random_password" "db" {
  length  = 32
  special = false
}
resource "aws_ssm_parameter" "db_password" {
  name  = "/${var.project_name}/db-password"
  type  = "SecureString"
  value = random_password.db.result
}
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db"
  subnet_ids = aws_subnet.private[*].id
}
resource "aws_db_instance" "main" {
  identifier                = "${var.project_name}-postgres"
  engine                    = "postgres"
  port                      = 5432
  engine_version            = var.db_engine_version
  instance_class            = var.db_instance_class
  allocated_storage         = var.db_allocated_storage
  storage_type              = "gp3"
  storage_encrypted         = true
  db_name                   = var.db_name
  username                  = var.db_username
  password                  = random_password.db.result
  db_subnet_group_name      = aws_db_subnet_group.main.name
  vpc_security_group_ids    = [aws_security_group.db.id]
  availability_zone         = local.azs[0]
  publicly_accessible       = false
  multi_az                  = false
  backup_retention_period   = var.db_backup_retention_days
  deletion_protection       = false
  skip_final_snapshot       = !var.db_final_snapshot
  final_snapshot_identifier = var.db_final_snapshot ? "${var.project_name}-final-${random_id.suffix.hex}" : null
  engine_lifecycle_support  = "open-source-rds-extended-support-disabled"
  copy_tags_to_snapshot     = true
}
