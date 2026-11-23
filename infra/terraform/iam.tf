locals {
  ec2_assume_role = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role" "master" {
  name_prefix        = "${var.project_name}-master-"
  assume_role_policy = local.ec2_assume_role
}
resource "aws_iam_role" "worker" {
  name_prefix        = "${var.project_name}-worker-"
  assume_role_policy = local.ec2_assume_role
}
resource "aws_iam_role_policy_attachment" "master_ssm" {
  role       = aws_iam_role.master.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_role_policy_attachment" "worker_ssm" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_role_policy" "master" {
  role = aws_iam_role.master.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ssm:GetParameter"], Resource = [aws_ssm_parameter.token.arn, aws_ssm_parameter.db_password.arn, aws_ssm_parameter.jwt_secret.arn, aws_ssm_parameter.admin_password.arn] },
    { Effect = "Allow", Action = ["s3:GetObject"], Resource = "arn:aws:s3:::${var.state_bucket_name}/bootstrap/${var.project_name}/*" }
  ] })
}
resource "aws_iam_role_policy" "worker" {
  role = aws_iam_role.worker.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ssm:GetParameter"], Resource = aws_ssm_parameter.token.arn },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.images.arn}/meals/*" }
  ] })
}
resource "aws_iam_instance_profile" "master" { role = aws_iam_role.master.name }
resource "aws_iam_instance_profile" "worker" { role = aws_iam_role.worker.name }

# Deploy pela pipeline (GitHub Actions -> SSM no master), sem access key guardada no GitHub:
# o job "deploy" troca o token OIDC do GitHub por credenciais temporarias desta role.
# Obs.: so pode existir um provider OIDC por URL na conta; se ja houver um para o GitHub,
# importe-o (terraform import aws_iam_openid_connect_provider.github <arn>).
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
resource "aws_iam_role" "github_deploy" {
  name_prefix = "${var.project_name}-gh-deploy-"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow"
    Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
    Action    = "sts:AssumeRoleWithWebIdentity"
    Condition = {
      StringEquals = {
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        # So o job com environment "production" deste repositorio (aprovacao manual no GitHub).
        "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:production"
      }
    }
  }] })
}
resource "aws_iam_role_policy" "github_deploy" {
  role = aws_iam_role.github_deploy.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ssm:SendCommand"], Resource = [aws_instance.master.arn, "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript"] },
    { Effect = "Allow", Action = ["ssm:GetCommandInvocation"], Resource = "*" }
  ] })
}
