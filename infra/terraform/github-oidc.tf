data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}

locals {
  github_oidc_host = "token.actions.githubusercontent.com"
  github_oidc_repository = var.github_repository_ids == null ? var.github_repository : format(
    "%s@%s/%s@%s",
    split("/", var.github_repository)[0], var.github_repository_ids.owner_id,
    split("/", var.github_repository)[1], var.github_repository_ids.repository_id
  )
  # GitHub codifica ':' em nomes de environments no subject do token.
  github_oidc_subject      = "repo:${local.github_oidc_repository}:environment:${replace(var.github_environment, ":", "%3A")}"
  github_oidc_provider_arn = var.github_oidc_provider_arn == null ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github_existing[0].arn
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.github_oidc_provider_arn == null ? 1 : 0
  url            = "https://${local.github_oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
  # Para GitHub, IAM usa sua cadeia de CAs confiaveis; sem thumbprint fixo.
}

data "aws_iam_openid_connect_provider" "github_existing" {
  count = var.github_oidc_provider_arn == null ? 0 : 1
  arn   = var.github_oidc_provider_arn

  lifecycle {
    precondition {
      condition     = var.github_oidc_provider_arn == "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${local.github_oidc_host}"
      error_message = "O provider OIDC existente deve pertencer a conta AWS atual e ao emissor do GitHub."
    }
    postcondition {
      condition     = trimprefix(self.url, "https://") == local.github_oidc_host && contains(self.client_id_list, "sts.amazonaws.com")
      error_message = "O provider existente deve usar token.actions.githubusercontent.com e aceitar sts.amazonaws.com."
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name = "${var.project_name}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = local.github_oidc_provider_arn }
      Condition = {
        StringEquals = {
          "${local.github_oidc_host}:aud" = "sts.amazonaws.com"
          "${local.github_oidc_host}:sub" = local.github_oidc_subject
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "deploy-via-ssm"
  role = aws_iam_role.github_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SendDeployCommandToMaster"
        Effect   = "Allow"
        Action   = ["ssm:SendCommand"]
        Resource = [aws_instance.master.arn, "arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}::document/AWS-RunShellScript"]
      },
      {
        Sid    = "ReadDeployCommandResult"
        Effect = "Allow"
        Action = ["ssm:GetCommandInvocation"]
        # Esta acao nao suporta restricao de recursos por ARN.
        Resource = "*"
      }
    ]
  })
}
