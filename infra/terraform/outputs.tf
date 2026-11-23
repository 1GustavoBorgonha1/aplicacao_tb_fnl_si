output "app_url" { value = "http://${aws_lb.app.dns_name}" }
output "master_instance_id" { value = aws_instance.master.id }
output "workers_autoscaling_group_name" { value = aws_autoscaling_group.workers.name }
output "workers_autoscaling_group_arn" { value = aws_autoscaling_group.workers.arn }
output "rds_endpoint" { value = aws_db_instance.main.endpoint }
output "images_bucket" { value = aws_s3_bucket.images.id }
output "images_base_url" { value = "https://${aws_s3_bucket.images.bucket_regional_domain_name}" }
output "db_password_parameter" { value = aws_ssm_parameter.db_password.name }
output "deployment_document" { value = aws_ssm_document.deploy.name }

output "admin_email" { value = var.admin_email }
output "admin_password_parameter" { value = aws_ssm_parameter.admin_password.name }
output "jwt_secret_parameter" { value = aws_ssm_parameter.jwt_secret.name }
output "github_deploy_role_arn" {
  description = "Configurar em AWS_DEPLOY_ROLE_ARN nas variaveis do GitHub Actions."
  value       = aws_iam_role.github_deploy.arn
}
