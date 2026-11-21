resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-"
  vpc_id      = aws_vpc.main.id
  ingress {
    description = "HTTP publico"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port       = 30080
    to_port         = 30080
    protocol        = "tcp"
    security_groups = [aws_security_group.worker.id]
  }
}
resource "aws_security_group" "cluster" {
  description = "Comunicacao interna K3s, kubelet e Flannel entre os quatro nos"
  name_prefix = "${var.project_name}-cluster-"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_security_group" "master" {
  name_prefix = "${var.project_name}-master-"
  vpc_id      = aws_vpc.main.id
}
resource "aws_security_group" "worker" {
  name_prefix = "${var.project_name}-worker-"
  vpc_id      = aws_vpc.main.id
}
resource "aws_vpc_security_group_ingress_rule" "alb_to_workers" {
  security_group_id            = aws_security_group.worker.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 30080
  to_port                      = 30080
  ip_protocol                  = "tcp"
}
resource "aws_security_group" "db" {
  name_prefix = "${var.project_name}-db-"
  vpc_id      = aws_vpc.main.id
  ingress {
    description     = "PostgreSQL: aplicacao e inicializacao do schema"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.master.id, aws_security_group.worker.id]
  }
}
