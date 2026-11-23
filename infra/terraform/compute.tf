data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}
resource "random_password" "token" {
  length  = 48
  special = false
}
resource "aws_ssm_parameter" "token" {
  name  = "/${var.project_name}/k3s-token"
  type  = "SecureString"
  value = random_password.token.result
}
resource "aws_instance" "master" {
  lifecycle { ignore_changes = [ami] }
  ami                         = nonsensitive(data.aws_ssm_parameter.ami.value)
  instance_type               = var.master_instance_type
  subnet_id                   = aws_subnet.private[0].id
  associate_public_ip_address = false
  vpc_security_group_ids      = [aws_security_group.cluster.id, aws_security_group.master.id]
  iam_instance_profile        = aws_iam_instance_profile.master.name
  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/templates/node.sh.tftpl", {
    region  = var.aws_region, token_parameter = aws_ssm_parameter.token.name,
    version = var.k3s_version, role = "server", master_ip = "", node_name = "${var.project_name}-master"
  })
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }
  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }
  tags       = { Name = "${var.project_name}-master" }
  depends_on = [aws_route.nat, aws_route_table_association.private, aws_iam_role_policy.master, aws_iam_role_policy_attachment.master_ssm]
}
resource "aws_launch_template" "worker" {
  lifecycle { ignore_changes = [image_id] }
  name_prefix   = "${var.project_name}-worker-"
  image_id      = nonsensitive(data.aws_ssm_parameter.ami.value)
  instance_type = var.worker_instance_type
  # O ASG escolhe a subnet; grupos e IP publico ficam na interface primaria.
  network_interfaces {
    device_index                = 0
    associate_public_ip_address = false
    delete_on_termination       = true
    security_groups             = [aws_security_group.cluster.id, aws_security_group.worker.id]
  }
  iam_instance_profile { name = aws_iam_instance_profile.worker.name }
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 20
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }
  user_data = base64encode(templatefile("${path.module}/templates/node.sh.tftpl", {
    region  = var.aws_region, token_parameter = aws_ssm_parameter.token.name,
    version = var.k3s_version, role = "agent", master_ip = aws_instance.master.private_ip, node_name = ""
  }))
}
resource "aws_autoscaling_group" "workers" {
  name                      = "${var.project_name}-workers"
  min_size                  = 3
  max_size                  = 3
  desired_capacity          = 3
  vpc_zone_identifier       = [aws_subnet.private[0].id]
  target_group_arns         = [aws_lb_target_group.app.arn]
  health_check_type         = "ELB"
  health_check_grace_period = var.worker_health_check_grace_period

  # A aplicacao so e publicada depois de criar o grupo. Esperar pelo ALB
  # aqui impediria o primeiro deploy; o script SSM aguarda tres nos Ready.
  wait_for_capacity_timeout = "0"

  launch_template {
    id      = aws_launch_template.worker.id
    version = tostring(aws_launch_template.worker.latest_version)
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 66
      max_healthy_percentage = 100
      instance_warmup        = 300
      skip_matching          = true
    }
  }

  dynamic "tag" {
    for_each = {
      Name      = "${var.project_name}-worker"
      Project   = var.project_name
      ManagedBy = "Terraform"
      Purpose   = "classroom"
    }
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  depends_on = [aws_route.nat, aws_route_table_association.private, aws_iam_role_policy.worker, aws_iam_role_policy_attachment.worker_ssm, aws_lb_listener.http]
}
