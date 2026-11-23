locals {
  base_backend   = [for document in split("\n---", file("${path.module}/manifests/backend.yaml")) : yamldecode(document)]
  base_frontend  = [for document in split("\n---", file("${path.module}/manifests/frontend.yaml")) : yamldecode(document)]
  base_namespace = yamldecode(file("${path.module}/manifests/namespace.yaml"))
  network_policies = [for document in split("\n---", file("${path.module}/manifests/networkpolicy.yaml")) : merge(yamldecode(document), {
    metadata = merge(yamldecode(document).metadata, { namespace = var.project_name })
  })]
  backend_environment = merge(var.backend_environment, {
    NODE_ENV   = "production", PORT = "3000", DATABASE_SSL = "true", STORAGE_DRIVER = "s3"
    S3_BUCKET  = aws_s3_bucket.images.id, S3_PUBLIC_URL = "https://${aws_s3_bucket.images.bucket_regional_domain_name}"
    AWS_REGION = var.aws_region, TRUST_PROXY = "2"
  })
  namespace_manifest = merge(local.base_namespace, {
    metadata = merge(local.base_namespace.metadata, { name = var.project_name })
  })
  backend_config = {
    apiVersion = "v1", kind = "ConfigMap"
    metadata   = { name = "backend-config", namespace = var.project_name }
    data       = local.backend_environment
  }
  backend_service = merge(local.base_backend[1], {
    metadata = merge(local.base_backend[1].metadata, { namespace = var.project_name })
  })
  frontend_service = merge(local.base_frontend[1], {
    metadata = merge(local.base_frontend[1].metadata, { namespace = var.project_name })
  })
  backend_deployment = merge(local.base_backend[0], {
    metadata = merge(local.base_backend[0].metadata, { namespace = var.project_name })
    spec = merge(local.base_backend[0].spec, {
      replicas = var.backend_replicas
      template = merge(local.base_backend[0].spec.template, {
        metadata = merge(local.base_backend[0].spec.template.metadata, {
          annotations = {
            "marmifit/config-hash" = sha256(jsonencode(local.backend_environment))
            "marmifit/secret-revision" = sha256(jsonencode({
              database = aws_ssm_parameter.db_password.version
              jwt      = aws_ssm_parameter.jwt_secret.version
              admin    = aws_ssm_parameter.admin_password.version
              email    = var.admin_email
            }))
          }
        })
        spec = merge(local.base_backend[0].spec.template.spec, {
          nodeSelector = { workload = "application" }
          containers = [merge(local.base_backend[0].spec.template.spec.containers[0], {
            image = var.backend_image, imagePullPolicy = "IfNotPresent"
          })]
        })
      })
    })
  })
  frontend_deployment = merge(local.base_frontend[0], {
    metadata = merge(local.base_frontend[0].metadata, { namespace = var.project_name })
    spec = merge(local.base_frontend[0].spec, {
      replicas = var.frontend_replicas
      template = merge(local.base_frontend[0].spec.template, {
        spec = merge(local.base_frontend[0].spec.template.spec, {
          nodeSelector = { workload = "application" }
          containers = [merge(local.base_frontend[0].spec.template.spec.containers[0], {
            image = var.frontend_image, imagePullPolicy = "IfNotPresent"
          })]
        })
      })
    })
  })
  platform_manifests = {
    apiVersion = "v1", kind = "List"
    items      = concat([local.namespace_manifest, local.backend_config, local.backend_service, local.frontend_service], local.network_policies)
  }
}
resource "aws_ssm_document" "deploy" {
  name            = "${var.project_name}-deploy"
  document_type   = "Command"
  document_format = "JSON"
  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Inicializa schema e aplica frontend/backend MarmiFit"
    mainSteps = [{
      action = "aws:runShellScript", name = "Deploy"
      inputs = {
        timeoutSeconds = "3600"
        runCommand = [templatefile("${path.module}/templates/deploy.sh.tftpl", {
          region                   = var.aws_region, namespace = var.project_name
          password_parameter       = aws_ssm_parameter.db_password.name
          jwt_parameter            = aws_ssm_parameter.jwt_secret.name
          admin_password_parameter = aws_ssm_parameter.admin_password.name
          admin_email_b64          = base64encode(var.admin_email)
          db_host                  = aws_db_instance.main.address, db_name = var.db_name, db_user = var.db_username
          schema_uri               = var.db_schema_file == "" ? "" : "s3://${var.state_bucket_name}/${aws_s3_object.schema[0].key}"
          platform_b64             = base64encode(jsonencode(local.platform_manifests))
          backend_b64              = base64encode(jsonencode(local.backend_deployment))
          frontend_b64             = base64encode(jsonencode(local.frontend_deployment))
        })]
      }
    }]
  })
}
resource "terraform_data" "deploy" {
  triggers_replace = {
    password_version = aws_ssm_parameter.db_password.version
    jwt_version      = aws_ssm_parameter.jwt_secret.version
    admin_version    = aws_ssm_parameter.admin_password.version
    document_version = aws_ssm_document.deploy.latest_version
    master_id        = aws_instance.master.id
    worker_group     = aws_autoscaling_group.worker.name
    worker_template  = aws_launch_template.worker.latest_version
    db_resource_id   = aws_db_instance.main.resource_id
    schema_hash      = var.db_schema_file == "" ? "" : filesha256("${path.root}/${var.db_schema_file}")
    script_hash      = filesha256("${path.module}/scripts/Invoke-Deployment.ps1")
  }
  provisioner "local-exec" {
    interpreter = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]
    command     = "${path.module}/scripts/Invoke-Deployment.ps1"
    environment = {
      DEPLOY_REGION   = var.aws_region
      DEPLOY_PROFILE  = var.aws_profile == null ? "" : var.aws_profile
      DEPLOY_INSTANCE = aws_instance.master.id
      DEPLOY_DOCUMENT = aws_ssm_document.deploy.name
      DEPLOY_VERSION  = aws_ssm_document.deploy.latest_version
    }
  }
  depends_on = [aws_autoscaling_group.worker, aws_s3_object.schema, aws_iam_role_policy.master, aws_wafv2_web_acl_association.app, aws_lb_listener.http]
}
