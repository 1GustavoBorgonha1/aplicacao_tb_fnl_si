mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = { names = ["us-east-2a", "us-east-2b"] }
  }
  mock_data "aws_ssm_parameter" {
    defaults = { value = "ami-0123456789abcdef0" }
  }
}
mock_provider "random" {}
variables {
  aws_profile         = null
  backend_image       = "example/backend:1.0.0"
  frontend_image      = "example/frontend:1.0.0"
  state_bucket_name   = "test-marmifit-state"
  backend_environment = {}
  admin_email         = "admin@example.com"
  db_schema_file      = ""
}
run "minimal_private_architecture" {
  command = plan
  assert {
    condition     = length(aws_subnet.public) == 2 && length(aws_subnet.private) == 2 && length(aws_instance.worker) == 3 && !aws_instance.master.associate_public_ip_address && !one(aws_launch_template.worker.network_interfaces).associate_public_ip_address
    error_message = "A rede deve manter tres workers e todos os nos privados."
  }
  assert {
    condition     = aws_db_instance.main.engine == "postgres" && aws_db_instance.main.port == 5432 && !aws_db_instance.main.publicly_accessible && !aws_db_instance.main.multi_az && aws_db_instance.main.storage_encrypted
    error_message = "O banco deve ser PostgreSQL privado e criptografado, Single-AZ."
  }
  assert {
    condition     = aws_lb_listener.http.port == 80 && aws_lb_target_group.app.port == 30080 && aws_lb_target_group.app.health_check[0].path == "/api/health" && aws_lb_target_group.app.health_check[0].matcher == "200"
    error_message = "ALB deve usar HTTP e verificar backend/banco pelo frontend."
  }
}
run "separate_deployments_and_private_backend" {
  command = plan
  assert {
    condition     = local.frontend_service.spec.type == "NodePort" && local.frontend_service.spec.ports[0].nodePort == 30080 && local.backend_service.spec.type == "ClusterIP" && local.backend_service.metadata.name == "backend" && local.backend_service.spec.ports[0].port == 3000
    error_message = "Somente frontend deve ser publico; Nginx depende do DNS backend:3000."
  }
  assert {
    condition     = local.backend_deployment.spec.template.spec.containers[0].image == var.backend_image && local.frontend_deployment.spec.template.spec.containers[0].image == var.frontend_image && local.backend_deployment.spec.template.spec.nodeSelector.workload == "application" && local.frontend_deployment.spec.template.spec.nodeSelector.workload == "application"
    error_message = "As imagens independentes devem rodar nos workers."
  }
  assert {
    condition     = local.backend_environment.DATABASE_SSL == "true" && local.backend_environment.STORAGE_DRIVER == "s3" && local.backend_environment.TRUST_PROXY == "2" && local.backend_environment.AWS_REGION == "us-east-2" && !contains(keys(local.backend_environment), "DATABASE_URL") && !contains(keys(local.backend_environment), "JWT_SECRET")
    error_message = "ConfigMap deve usar TLS/S3 e nao pode conter os segredos."
  }
  assert {
    condition     = local.backend_deployment.spec.template.spec.securityContext.runAsNonRoot && local.frontend_deployment.spec.template.spec.securityContext.runAsNonRoot && local.backend_deployment.spec.template.spec.containers[0].securityContext.readOnlyRootFilesystem && local.namespace_manifest.metadata.labels["pod-security.kubernetes.io/enforce"] == "restricted" && length(local.network_policies) == 3
    error_message = "Preservar hardening dos manifests e isolamento de entrada."
  }
  assert {
    condition     = aws_ssm_parameter.jwt_secret.type == "SecureString" && aws_ssm_parameter.admin_password.type == "SecureString" && random_password.jwt_secret.length >= 32
    error_message = "JWT persistente e senha inicial devem usar SecureString."
  }
}
run "image_replica_and_environment_changes" {
  command = plan
  variables {
    backend_image       = "example/backend:2.0.0"
    frontend_image      = "example/frontend:3.0.0"
    backend_replicas    = 3
    frontend_replicas   = 1
    backend_environment = { LOG_LEVEL = "debug" }
    db_schema_file      = "tests/fixtures/schema.sql"
  }
  assert {
    condition     = local.backend_deployment.spec.template.spec.containers[0].image == "example/backend:2.0.0" && local.frontend_deployment.spec.template.spec.containers[0].image == "example/frontend:3.0.0" && local.backend_deployment.spec.replicas == 3 && local.frontend_deployment.spec.replicas == 1 && local.backend_environment.LOG_LEVEL == "debug"
    error_message = "Imagens, replicas e configuracoes devem acompanhar os parametros."
  }
  assert {
    condition     = length(aws_s3_object.schema) == 1 && aws_s3_object.schema[0].key == "bootstrap/marmifit/schema.sql" && aws_s3_object.schema[0].server_side_encryption == "AES256"
    error_message = "Schema deve ser publicado somente no prefixo privado."
  }
}
run "upload_exception_preserves_waf" {
  command = plan
  assert {
    condition     = one([for rule in aws_wafv2_web_acl.app.rule : rule if rule.name == "BlockLargeBodiesOutsideUploads"]).priority == 2 && one([for rule in aws_wafv2_web_acl.app.rule : rule if rule.name == "RateLimit"]).priority == 3 && strcontains(jsonencode(aws_wafv2_web_acl.app.rule), "awswaf:managed:aws:core-rule-set:SizeRestrictions_Body") && strcontains(jsonencode(aws_wafv2_web_acl.app.rule), "multipart/form-data") && strcontains(jsonencode(aws_wafv2_web_acl.app.rule), "^/api/meals(/[0-9]+)?/?$")
    error_message = "A excecao de tamanho deve depender da rota e multipart, mantendo o bloqueio e rate limit."
  }
}
run "waf_blocks_sqli_and_known_bad_inputs" {
  command = plan
  assert {
    condition     = strcontains(jsonencode(aws_wafv2_web_acl.app.rule), "AWSManagedRulesSQLiRuleSet") && strcontains(jsonencode(aws_wafv2_web_acl.app.rule), "AWSManagedRulesKnownBadInputsRuleSet") && one([for rule in aws_wafv2_web_acl.app.rule : rule if rule.name == "SQLiRules"]).priority == 4 && one([for rule in aws_wafv2_web_acl.app.rule : rule if rule.name == "KnownBadInputs"]).priority == 5
    error_message = "O WAF deve aplicar as regras gerenciadas de SQL injection e de entradas maliciosas."
  }
}
run "real_postgresql_schema" {
  command = plan
  variables { db_schema_file = "schema.sql" }
  assert {
    condition     = length(aws_s3_object.schema) == 1 && aws_s3_object.schema[0].source_hash == filesha256("schema.sql") && strcontains(file("schema.sql"), "003_horario_retirada.sql")
    error_message = "Schema real deve incluir a terceira migration e ser publicado com hash correto."
  }
}
run "reject_latest_backend" {
  command = plan
  variables { backend_image = "example/backend:latest" }
  expect_failures = [var.backend_image]
}
run "reject_latest_frontend" {
  command = plan
  variables { frontend_image = "example/frontend:latest" }
  expect_failures = [var.frontend_image]
}
run "reject_missing_schema" {
  command = plan
  variables { db_schema_file = "sql/does-not-exist.sql" }
  expect_failures = [var.db_schema_file]
}
run "reject_plaintext_secret_override" {
  command = plan
  variables { backend_environment = { JWT_SECRET = "forbidden" } }
  expect_failures = [var.backend_environment]
}
run "reject_database_ssl_override" {
  command = plan
  variables { backend_environment = { DATABASE_SSL = "false" } }
  expect_failures = [var.backend_environment]
}
run "reject_invalid_admin_email" {
  command = plan
  variables { admin_email = "invalid" }
  expect_failures = [var.admin_email]
}

run "worker_network_has_single_configuration_source" {
  command = plan
  override_resource {
    override_during = plan
    target          = aws_subnet.private[0]
    values          = { id = "subnet-0123456789abcdef0" }
  }
  override_resource {
    override_during = plan
    target          = aws_security_group.cluster
    values          = { id = "sg-0123456789abcdef0" }
  }
  override_resource {
    override_during = plan
    target          = aws_security_group.worker
    values          = { id = "sg-0123456789abcdef1" }
  }
  assert {
    condition     = length(aws_launch_template.worker.network_interfaces) == 1 && one(aws_launch_template.worker.network_interfaces).device_index == 0 && one(aws_launch_template.worker.network_interfaces).subnet_id == aws_subnet.private[0].id && !one(aws_launch_template.worker.network_interfaces).associate_public_ip_address && one(aws_launch_template.worker.network_interfaces).delete_on_termination
    error_message = "Workers devem herdar interface primaria privada do template, sem IP publico."
  }
  assert {
    condition     = length(one(aws_launch_template.worker.network_interfaces).security_groups) == 2 && aws_launch_template.worker.vpc_security_group_ids == null
    error_message = "Security groups devem existir somente na interface, nunca no nivel da instancia/template."
  }
}
