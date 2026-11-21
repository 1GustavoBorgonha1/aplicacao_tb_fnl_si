# Estes valores ficam no estado privado do Terraform e em SecureString no SSM.
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}
resource "random_password" "admin_password" {
  length  = 32
  special = false
}
resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/${var.project_name}/jwt-secret"
  type  = "SecureString"
  value = random_password.jwt_secret.result
}
resource "aws_ssm_parameter" "admin_password" {
  name  = "/${var.project_name}/admin-password"
  type  = "SecureString"
  value = random_password.admin_password.result
}
