mock_provider "aws" {
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
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
    condition     = length(aws_subnet.public) == 2 && length(aws_subnet.private) == 2 && aws_autoscaling_group.workers.min_size == 3 && aws_autoscaling_group.workers.max_size == 3 && aws_autoscaling_group.workers.desired_capacity == 3 && !aws_instance.master.associate_public_ip_address && !one(aws_launch_template.worker.network_interfaces).associate_public_ip_address
    error_message = "A rede deve manter tres workers e todos os nos privados."
  }
  assert {
    condition     = aws_db_instance.main.engine == "postgres" && aws_db_instance.main.port == 5432 && !aws_db_instance.main.publicly_accessible && !aws_db_instance.main.multi_az && aws_db_instance.main.storage_encrypted
    error_message = "O banco deve ser PostgreSQL privado e criptografado, Single-AZ."
  }
  assert {
    condition     = aws_lb_listener.http.port == 80 && aws_lb_target_group.app.port == 30080 && aws_lb_target_group.app.health_check[0].path == "/" && aws_lb_target_group.app.health_check[0].matcher == "200"
    error_message = "ALB deve usar HTTP e testar o frontend sem depender da disponibilidade do banco."
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
    condition     = length(aws_launch_template.worker.network_interfaces) == 1 && one(aws_launch_template.worker.network_interfaces).device_index == 0 && one(aws_launch_template.worker.network_interfaces).subnet_id == null && length(aws_autoscaling_group.workers.vpc_zone_identifier) == 1 && contains(aws_autoscaling_group.workers.vpc_zone_identifier, aws_subnet.private[0].id) && !one(aws_launch_template.worker.network_interfaces).associate_public_ip_address && one(aws_launch_template.worker.network_interfaces).delete_on_termination
    error_message = "A subnet deve ser definida somente no ASG; a interface primaria continua privada no template."
  }
  assert {
    condition     = length(one(aws_launch_template.worker.network_interfaces).security_groups) == 2 && aws_launch_template.worker.vpc_security_group_ids == null
    error_message = "Security groups devem existir somente na interface, nunca no nivel da instancia/template."
  }
}

run "asg_uses_alb_and_versioned_template" {
  command = plan
  override_resource {
    override_during = plan
    target          = aws_lb_target_group.app
    values          = { arn = "arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/test/1234567890123456" }
  }
  override_resource {
    override_during = plan
    target          = aws_launch_template.worker
    values          = { id = "lt-0123456789abcdef0", latest_version = 7 }
  }
  assert {
    condition     = aws_autoscaling_group.workers.health_check_type == "ELB" && aws_autoscaling_group.workers.health_check_grace_period == 1800 && contains(aws_autoscaling_group.workers.target_group_arns, aws_lb_target_group.app.arn) && length(aws_autoscaling_group.workers.target_group_arns) == 1
    error_message = "ASG deve verificar o ALB, registrar o target group e respeitar a carencia inicial."
  }
  assert {
    condition     = one(aws_autoscaling_group.workers.launch_template).id == aws_launch_template.worker.id && one(aws_autoscaling_group.workers.launch_template).version == "7" && one(aws_autoscaling_group.workers.instance_refresh).strategy == "Rolling" && one(one(aws_autoscaling_group.workers.instance_refresh).preferences).min_healthy_percentage == 66 && one(one(aws_autoscaling_group.workers.instance_refresh).preferences).max_healthy_percentage == 100 && one(one(aws_autoscaling_group.workers.instance_refresh).preferences).skip_matching
    error_message = "O refresh deve usar a versao numerica do template e substituir instancias gradualmente."
  }
  assert {
    condition     = aws_autoscaling_group.workers.wait_for_capacity_timeout == "0" && terraform_data.deploy.triggers_replace.workers_asg == aws_autoscaling_group.workers.name && terraform_data.deploy.triggers_replace.worker_template == "7"
    error_message = "O primeiro deploy nao pode esperar targets saudaveis antes de publicar a aplicacao."
  }
  assert {
    condition     = output.workers_autoscaling_group_name == aws_autoscaling_group.workers.name && alltrue([for tag in aws_autoscaling_group.workers.tag : tag.propagate_at_launch])
    error_message = "ASG deve expor seu nome e propagar as tags para instancias substituidas."
  }
}
run "replacement_worker_has_unique_k3s_identity" {
  command = plan
  override_resource {
    override_during = plan
    target          = aws_instance.master
    values          = { private_ip = "10.20.10.10" }
  }
  assert {
    condition     = strcontains(base64decode(aws_launch_template.worker.user_data), "with-node-id: true") && strcontains(base64decode(aws_launch_template.worker.user_data), "https://10.20.10.10:6443") && strcontains(base64decode(aws_launch_template.worker.user_data), "workload=application") && !strcontains(aws_instance.master.user_data, "with-node-id: true")
    error_message = "Workers novos devem receber identidade unica, endpoint do master e label da aplicacao; master mantem identidade fixa."
  }
}
run "custom_worker_grace_period" {
  command = plan
  variables { worker_health_check_grace_period = 2700 }
  assert {
    condition     = aws_autoscaling_group.workers.health_check_grace_period == 2700
    error_message = "A carencia precisa ser configuravel para provisionamentos mais lentos."
  }
}
run "reject_negative_worker_grace_period" {
  command = plan
  variables { worker_health_check_grace_period = -1 }
  expect_failures = [var.worker_health_check_grace_period]
}
run "reject_fractional_worker_grace_period" {
  command = plan
  variables { worker_health_check_grace_period = 1.5 }
  expect_failures = [var.worker_health_check_grace_period]
}

run "waf_managed_attack_groups_keep_aws_actions" {
  command = plan
  assert {
    condition     = one(one(one([for rule in aws_wafv2_web_acl.app.rule : rule if rule.name == "SQLInjectionRules"]).statement).managed_rule_group_statement).name == "AWSManagedRulesSQLiRuleSet" && one(one(one([for rule in aws_wafv2_web_acl.app.rule : rule if rule.name == "KnownBadInputsRules"]).statement).managed_rule_group_statement).name == "AWSManagedRulesKnownBadInputsRuleSet"
    error_message = "WAF deve incluir os grupos gerenciados de SQL injection e Known Bad Inputs."
  }
  assert {
    condition     = alltrue([for rule in aws_wafv2_web_acl.app.rule : one(one(rule.statement).managed_rule_group_statement).vendor_name == "AWS" && length(one(rule.override_action).none) == 1 && length(one(rule.override_action).count) == 0 && length(one(one(rule.statement).managed_rule_group_statement).rule_action_override) == 0 if contains(["SQLInjectionRules", "KnownBadInputsRules"], rule.name)])
    error_message = "Os novos grupos devem preservar as acoes da AWS, sem overrides de regras ou Count global."
  }
}
run "waf_rules_have_unique_priorities_and_metrics" {
  command = plan
  assert {
    condition     = length(aws_wafv2_web_acl.app.rule) == 5 && toset([for rule in aws_wafv2_web_acl.app.rule : rule.priority]) == toset([1, 2, 3, 4, 5]) && one([for rule in aws_wafv2_web_acl.app.rule : rule if rule.name == "SQLInjectionRules"]).priority == 4 && one([for rule in aws_wafv2_web_acl.app.rule : rule if rule.name == "KnownBadInputsRules"]).priority == 5
    error_message = "As regras devem manter prioridades existentes e acrescentar SQLi/Known Bad Inputs em 4 e 5."
  }
  assert {
    condition     = alltrue([for rule in aws_wafv2_web_acl.app.rule : one(rule.visibility_config).cloudwatch_metrics_enabled && one(rule.visibility_config).sampled_requests_enabled]) && length(distinct([for rule in aws_wafv2_web_acl.app.rule : one(rule.visibility_config).metric_name])) == 5
    error_message = "Cada regra deve ter metrica propria e amostragem de requisicoes habilitada."
  }
}
run "upload_size_exception_does_not_bypass_attack_groups" {
  command = plan
  assert {
    condition     = alltrue([for rule in aws_wafv2_web_acl.app.rule : length(one(one(rule.statement).managed_rule_group_statement).scope_down_statement) == 0 if contains(["SQLInjectionRules", "KnownBadInputsRules"], rule.name)])
    error_message = "Rotas de upload tambem devem ser inspecionadas pelos novos grupos, sem exclusao de escopo."
  }
  assert {
    condition     = one(one(one(one([for rule in aws_wafv2_web_acl.app.rule : rule if rule.name == "CommonRules"]).statement).managed_rule_group_statement).rule_action_override).name == "SizeRestrictions_BODY" && length(one(one(one(one([for rule in aws_wafv2_web_acl.app.rule : rule if rule.name == "CommonRules"]).statement).managed_rule_group_statement).rule_action_override).action_to_use[0].count) == 1
    error_message = "A excecao existente deve continuar limitada a regra de tamanho do Common Rule Set."
  }
}

run "github_oidc_creates_provider_and_restricts_trust" {
  command = plan
  override_resource {
    override_during = plan
    target          = aws_iam_openid_connect_provider.github[0]
    values          = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  }
  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 1 && length(data.aws_iam_openid_connect_provider.github_existing) == 0 && aws_iam_openid_connect_provider.github[0].url == "https://token.actions.githubusercontent.com" && toset(aws_iam_openid_connect_provider.github[0].client_id_list) == toset(["sts.amazonaws.com"])
    error_message = "Por padrao o provider deve ser criado para GitHub e audience STS."
  }
  assert {
    condition     = length(jsondecode(aws_iam_role.github_deploy.assume_role_policy).Statement) == 1 && jsondecode(aws_iam_role.github_deploy.assume_role_policy).Statement[0].Action == "sts:AssumeRoleWithWebIdentity" && jsondecode(aws_iam_role.github_deploy.assume_role_policy).Statement[0].Principal.Federated == aws_iam_openid_connect_provider.github[0].arn && jsondecode(aws_iam_role.github_deploy.assume_role_policy).Statement[0].Condition.StringEquals == { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com", "token.actions.githubusercontent.com:sub" = "repo:1GustavoBorgonha1/aplicacao_tb_fnl_si:environment:production" }
    error_message = "A confianca deve exigir emissor, audience e subject exatos do repositorio/environment."
  }
}
run "github_deploy_permissions_are_limited_to_master" {
  command = plan
  override_resource {
    override_during = plan
    target          = aws_instance.master
    values          = { arn = "arn:aws:ec2:us-east-2:123456789012:instance/i-0123456789abcdef0" }
  }
  override_resource {
    override_during = plan
    target          = aws_iam_role.github_deploy
    values          = { arn = "arn:aws:iam::123456789012:role/marmifit-github-deploy" }
  }
  assert {
    condition     = length(jsondecode(aws_iam_role_policy.github_deploy.policy).Statement) == 2 && toset(flatten([for statement in jsondecode(aws_iam_role_policy.github_deploy.policy).Statement : statement.Action])) == toset(["ssm:SendCommand", "ssm:GetCommandInvocation"])
    error_message = "A role nao deve ganhar permissoes adicionais de SSM, EC2, IAM, S3 ou RDS."
  }
  assert {
    condition     = toset(one([for statement in jsondecode(aws_iam_role_policy.github_deploy.policy).Statement : statement if statement.Sid == "SendDeployCommandToMaster"]).Resource) == toset([aws_instance.master.arn, "arn:aws:ssm:us-east-2::document/AWS-RunShellScript"]) && one([for statement in jsondecode(aws_iam_role_policy.github_deploy.policy).Statement : statement if statement.Sid == "ReadDeployCommandResult"]).Resource == "*" && one([for statement in jsondecode(aws_iam_role_policy.github_deploy.policy).Statement : statement if statement.Sid == "ReadDeployCommandResult"]).Action == ["ssm:GetCommandInvocation"]
    error_message = "SendCommand deve ter apenas master/documento; Resource '*' fica somente na leitura sem suporte a ARN."
  }
  assert {
    condition     = output.github_deploy_role_arn == aws_iam_role.github_deploy.arn
    error_message = "O ARN publicado deve ser o da role criada para a pipeline."
  }
}
run "github_oidc_reuses_existing_provider" {
  command = plan
  variables { github_oidc_provider_arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  override_data {
    target = data.aws_iam_openid_connect_provider.github_existing[0]
    values = {
      arn            = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      url            = "token.actions.githubusercontent.com"
      client_id_list = ["sts.amazonaws.com"]
    }
  }
  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0 && length(data.aws_iam_openid_connect_provider.github_existing) == 1 && jsondecode(aws_iam_role.github_deploy.assume_role_policy).Statement[0].Principal.Federated == var.github_oidc_provider_arn
    error_message = "Provider existente deve ser somente consultado, sem criar outro para a mesma URL."
  }
}
run "github_oidc_rejects_other_account" {
  command = plan
  variables { github_oidc_provider_arn = "arn:aws:iam::999999999999:oidc-provider/token.actions.githubusercontent.com" }
  expect_failures = [data.aws_iam_openid_connect_provider.github_existing]
}
run "github_oidc_rejects_existing_wrong_audience" {
  command = plan
  variables { github_oidc_provider_arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  override_data {
    target = data.aws_iam_openid_connect_provider.github_existing[0]
    values = {
      arn            = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      url            = "https://token.actions.githubusercontent.com"
      client_id_list = ["other-audience"]
    }
  }
  expect_failures = [data.aws_iam_openid_connect_provider.github_existing]
}
run "github_oidc_rejects_existing_wrong_issuer" {
  command = plan
  variables { github_oidc_provider_arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  override_data {
    target = data.aws_iam_openid_connect_provider.github_existing[0]
    values = {
      arn            = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      url            = "https://other.example.com"
      client_id_list = ["sts.amazonaws.com"]
    }
  }
  expect_failures = [data.aws_iam_openid_connect_provider.github_existing]
}
run "github_oidc_custom_repository_and_environment" {
  command = plan
  variables {
    github_repository  = "owner-test/project-test"
    github_environment = "production:restricted"
  }
  assert {
    condition     = local.github_oidc_subject == "repo:owner-test/project-test:environment:production%3Arestricted"
    error_message = "Subject deve acompanhar os parametros e codificar dois-pontos no nome do environment."
  }
}
run "github_oidc_rejects_repository_wildcard" {
  command = plan
  variables { github_repository = "1GustavoBorgonha1/*" }
  expect_failures = [var.github_repository]
}
run "github_oidc_rejects_environment_wildcard" {
  command = plan
  variables { github_environment = "*" }
  expect_failures = [var.github_environment]
}
run "github_oidc_rejects_unrelated_provider_arn" {
  command = plan
  variables { github_oidc_provider_arn = "arn:aws:iam::123456789012:oidc-provider/other.example.com" }
  expect_failures = [var.github_oidc_provider_arn]
}
