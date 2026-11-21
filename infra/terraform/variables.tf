variable "aws_region" {
  type    = string
  default = "us-east-2"
}
variable "aws_profile" {
  type    = string
  default = null
}
variable "project_name" {
  type    = string
  default = "marmifit"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,19}$", var.project_name))
    error_message = "Use 3 a 20 caracteres minusculos, numeros e hifen; inicie com letra."
  }
}
variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
  validation {
    condition     = can(cidrsubnet(var.vpc_cidr, 8, 30)) && try(tonumber(split("/", var.vpc_cidr)[1]) <= 16, false)
    error_message = "Informe um CIDR IPv4 /16 ou maior."
  }
}
variable "availability_zones" {
  description = "Duas AZs; vazio seleciona as duas primeiras. EC2 e RDS usam a primeira."
  type        = list(string)
  default     = []
  validation {
    condition     = length(var.availability_zones) == 0 || (length(var.availability_zones) == 2 && length(distinct(var.availability_zones)) == 2)
    error_message = "Informe nenhuma ou duas AZs distintas."
  }
}
variable "master_instance_type" {
  type    = string
  default = "t3.small"
}
variable "worker_instance_type" {
  type    = string
  default = "t3.small"
}
variable "k3s_version" {
  type    = string
  default = "v1.34.1+k3s1"
}
variable "backend_image" {
  description = "Imagem publica Linux amd64, com tag de versao ou digest."
  type        = string
  default     = "gustavoborgonha/marmifit-backend:10a771b00532caff63ee1d94218bafaea9636f3b"
  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._/:@+-]*(:[A-Za-z0-9_][A-Za-z0-9_.-]*|@sha256:[a-f0-9]{64})$", var.backend_image)) && !endswith(var.backend_image, ":latest")
    error_message = "Informe imagem com tag explicita (exceto latest) ou digest sha256."
  }
}
variable "backend_replicas" {
  type    = number
  default = 2
  validation {
    condition     = var.backend_replicas >= 1 && floor(var.backend_replicas) == var.backend_replicas
    error_message = "Use um inteiro positivo."
  }
}
variable "frontend_image" {
  description = "Imagem publica Linux amd64, com tag de versao ou digest."
  type        = string
  default     = "gustavoborgonha/marmifit-frontend:10a771b00532caff63ee1d94218bafaea9636f3b"
  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._/:@+-]*(:[A-Za-z0-9_][A-Za-z0-9_.-]*|@sha256:[a-f0-9]{64})$", var.frontend_image)) && !endswith(var.frontend_image, ":latest")
    error_message = "Informe imagem com tag explicita (exceto latest) ou digest sha256."
  }
}
variable "frontend_replicas" {
  type    = number
  default = 2
  validation {
    condition     = var.frontend_replicas >= 1 && floor(var.frontend_replicas) == var.frontend_replicas
    error_message = "Use um inteiro positivo."
  }
}
variable "admin_email" {
  description = "Email do administrador inicial. A senha e gerada e guardada no Parameter Store."
  type        = string
  default     = "admin@marmifit.local"
  validation {
    condition     = can(regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", var.admin_email))
    error_message = "Informe um email valido para o administrador inicial."
  }
}
variable "backend_environment" {
  description = "Configuracoes adicionais NAO sensiveis do backend. Campos de infraestrutura sao reservados."
  type        = map(string)
  default     = {}
  validation {
    condition     = alltrue([for name in keys(var.backend_environment) : can(regex("^[A-Za-z_][A-Za-z0-9_]*$", name))]) && length(setintersection(toset(keys(var.backend_environment)), toset(["DATABASE_URL", "DATABASE_SSL", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD", "PORT", "NODE_ENV", "STORAGE_DRIVER", "S3_BUCKET", "S3_PUBLIC_URL", "AWS_REGION", "TRUST_PROXY"]))) == 0
    error_message = "Use nomes validos e nao sobrescreva conexao, segredos ou configuracoes reservadas."
  }
}
variable "db_name" {
  type    = string
  default = "marmifit"
  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{0,62}$", var.db_name))
    error_message = "Use ate 63 caracteres minusculos, numeros e underscore, iniciando com letra."
  }
}
variable "db_username" {
  type    = string
  default = "appadmin"
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]{0,15}$", var.db_username)) && !contains(["rdsadmin", "rds_superuser"], lower(var.db_username))
    error_message = "Use um usuario nao reservado com ate 16 caracteres alfanumericos."
  }
}
variable "db_engine_version" {
  type    = string
  default = "16"
}
variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}
variable "db_allocated_storage" {
  type    = number
  default = 20
  validation {
    condition     = var.db_allocated_storage >= 20 && floor(var.db_allocated_storage) == var.db_allocated_storage
    error_message = "Use pelo menos 20 GiB."
  }
}
variable "db_schema_file" {
  description = "Caminho relativo a raiz para SQL existente. Vazio pula importacao."
  type        = string
  default     = "schema.sql"
  validation {
    condition     = var.db_schema_file == "" || fileexists("${path.root}/${var.db_schema_file}")
    error_message = "O arquivo SQL deve existir antes do plan/apply."
  }
}
variable "db_backup_retention_days" {
  type    = number
  default = 1
  validation {
    condition     = var.db_backup_retention_days >= 1 && var.db_backup_retention_days <= 35 && floor(var.db_backup_retention_days) == var.db_backup_retention_days
    error_message = "Use entre 1 e 35 dias."
  }
}
variable "db_final_snapshot" {
  description = "True cria snapshot final ao excluir; false simplifica remocao do laboratorio."
  type        = bool
  default     = false
}
variable "state_bucket_name" {
  description = "Bucket do bootstrap/backend, tambem recebe o SQL no prefixo bootstrap/."
  type        = string
}
variable "images_bucket_name" {
  type    = string
  default = null
}
variable "images_cors_origins" {
  type    = list(string)
  default = []
}
variable "images_force_destroy" {
  type    = bool
  default = false
}
