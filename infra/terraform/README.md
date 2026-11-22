# Infraestrutura AWS — MarmiFit

Esta pasta deve ficar em **`infra/terraform/`** no repositório `aplicacao_tb_fnl_si`. O Terraform provisiona a infraestrutura e executa o deploy das imagens públicas já existentes. Os comandos abaixo usam **Windows e PowerShell**. Se o terminal mostrar apenas `C:\...>` (CMD), digite `powershell` para seguir os exemplos. Comandos com `$variavel`, `Copy-Item` e `Set-Location` são específicos do PowerShell; a consulta da senha também tem uma alternativa em CMD abaixo.

## Infraestrutura

```text
Internet → ALB HTTP/80 com WAF → workers:30080 → frontend Nginx:8080
                                                    → backend interno:3000
                                                        ├─ RDS PostgreSQL:5432
                                                        └─ S3 de imagens
```

| Componente | Configuração |
|---|---|
| Região | `us-east-2` |
| Rede | Uma VPC, duas subnets públicas e duas privadas em duas zonas |
| Kubernetes | K3s em quatro EC2 privadas: um master e três workers |
| Aplicação | Frontend e backend separados, duas réplicas de cada por padrão |
| Entrada | ALB público, WAF e NodePort 30080; backend com Service interno |
| Saída | Um NAT Gateway e um Gateway Endpoint para S3 |
| Banco | RDS PostgreSQL 16 privado, Single-AZ, criptografado; acesso do master e workers |
| Imagens | Bucket S3 com leitura pública somente em `meals/*`; escrita autenticada |
| Estado | Outro bucket S3, privado, versionado e criptografado, com lock nativo |
| Administração | Systems Manager; sem SSH público ou IP público nas EC2 |
| Segredos | Senha do banco, senha inicial do admin e JWT no Parameter Store |

Master, workers e RDS ficam na primeira zona. A segunda atende aos requisitos do ALB e do grupo de subnets do RDS. É um laboratório com master, NAT e banco únicos. O acesso é por HTTP no DNS do ALB; as imagens são lidas diretamente do S3 por HTTPS.

O WAF possui regras gerenciadas e limite por IP, com tratamento de tamanho para permitir os uploads da aplicação. Os manifests mantêm containers sem root, NetworkPolicies e limites de recursos. O frontend não recebe os segredos do backend.

## 1. Instalar as ferramentas

**Terraform:** baixe o ZIP Windows AMD64 no [site oficial da HashiCorp](https://developer.hashicorp.com/terraform/install), extraia `terraform.exe` para uma pasta, como `C:\Tools\terraform`, e adicione essa pasta ao `PATH` do Windows. Use Terraform **>= 1.10 e < 2.0**.

**AWS CLI v2:** execute o [instalador oficial para Windows](https://awscli.amazonaws.com/AWSCLIV2.msi), que pode solicitar permissão de administrador. [Instruções da AWS](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).

Reabra o PowerShell e confira:

```powershell
terraform -version
aws --version
```

Também é necessário Git para obter o repositório. Docker e kubectl locais não são necessários para provisionar: os workers baixam as imagens publicadas e o master executa o deploy via SSM.

## 2. Configurar o acesso SSO

O administrador precisa cadastrar seu usuário no IAM Identity Center e atribuir um permission set à conta de destino. Solicite **URL do portal SSO, região do Identity Center e ID da conta**. As permissões devem cobrir EC2/VPC, ALB, WAF, RDS, S3, SSM e IAM, incluindo `iam:PassRole`.

Crie o perfil local:

```powershell
aws configure sso --profile projeto-aula
```

| Campo | Valor |
|---|---|
| SSO session name | `projeto-aula` |
| SSO start URL | URL do portal enviada pelo administrador |
| SSO region | Região do Identity Center, que pode diferir de `us-east-2` |
| SSO registration scopes | Aceite `sso:account:access` |
| Conta e role | Selecione a conta do projeto e o permission set atribuído |
| Default client Region | `us-east-2` |
| Output format | `json` |

Faça login e confirme a conta:

```powershell
aws sso login --profile projeto-aula
aws sts get-caller-identity --profile projeto-aula
```

O campo `Account` deve ser o ID da conta de destino. Substitua `projeto-aula` pelo seu perfil real em todos os exemplos. Quando a sessão expirar, repita `aws sso login`. [Referência SSO da AWS](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html).

## 3. Criar o bucket de estado — bootstrap

A partir da raiz do repositório da aplicação:

```powershell
Set-Location infra/terraform
Copy-Item bootstrap/terraform.tfvars.example bootstrap/terraform.tfvars
```

Edite `bootstrap/terraform.tfvars` para informar `aws_profile = "projeto-aula"` e manter `aws_region = "us-east-2"`. Em seguida:

```powershell
terraform -chdir=bootstrap init
terraform -chdir=bootstrap plan
terraform -chdir=bootstrap apply
terraform -chdir=bootstrap output -raw state_bucket_name
```

Execute essa etapa somente uma vez. Se já criou o bucket, reutilize-o. O bootstrap tem estado **local**: guarde `bootstrap/terraform.tfstate` em local seguro, fora do Git. O bucket tem proteção contra destruição e permanece após remover a infraestrutura principal.

## 4. Preencher as configurações

Somente se os arquivos reais ainda não existirem:

```powershell
Copy-Item terraform.tfvars.example terraform.tfvars
Copy-Item backend.hcl.example backend.hcl
```

No `backend.hcl`, configure:

```hcl
bucket       = "nome-retornado-pelo-bootstrap"
key          = "marmifit/terraform.tfstate"
region       = "us-east-2"
profile      = "projeto-aula"
encrypt      = true
use_lockfile = true
```

No `terraform.tfvars`, preencha principalmente:

```hcl
aws_region        = "us-east-2"
aws_profile       = "projeto-aula"
state_bucket_name = "nome-retornado-pelo-bootstrap"
admin_email       = "seu-email@exemplo.com"
backend_replicas   = 2
frontend_replicas  = 2
backend_environment = { LOG_LEVEL = "info" }
db_schema_file    = "schema.sql"
```

Use **o mesmo bucket** no backend e no tfvars; o backend não lê essas variáveis automaticamente. O exemplo completo também permite ajustar tipos das EC2, tamanho do RDS, backups e imagens.

As imagens configuradas são:

```hcl
backend_image  = "gustavoborgonha/marmifit-backend:10a771b00532caff63ee1d94218bafaea9636f3b"
frontend_image = "gustavoborgonha/marmifit-frontend:10a771b00532caff63ee1d94218bafaea9636f3b"
```

Use tags de versão ou digest, sem `latest`. `backend_environment = {}` também é válido: o log padrão da aplicação é `info`. Esse mapa aceita apenas configurações não sensíveis; conexão, segredos, TLS e dados do S3 são fornecidos pelo Terraform.

## 5. Provisionar e fazer o deploy

Na pasta `infra/terraform`:

```powershell
terraform init -reconfigure -backend-config=backend.hcl
terraform validate
terraform plan -out=infra.tfplan
terraform apply infra.tfplan
terraform output -raw app_url
```

Revise o plano antes do apply. O apply cria recursos cobrados na conta AWS e depois acompanha o deploy via SSM no master. Não execute outro apply ou mova a pasta enquanto esse processo estiver em andamento.

O master importa o schema uma única vez, com TLS e interrupção em erros, registrando a conclusão em `public._terraform_bootstrap`. Depois aplica frontend/backend e aguarda os rollouts. O schema inclui as migrations 001, 002 e 003; com `db_schema_file = ""`, o backend aplica as migrations no startup. Editar o SQL após a importação inicial não reexecuta o schema.

Se a etapa SSM falhar, os recursos já criados permanecem na AWS. Consulte o comando SSM indicado na saída, corrija a causa e gere/aplique um novo plano após o comando anterior terminar.

### Gerar os planos localmente

**Arquivos de plano não devem ser enviados ao Git.** Cada pessoa gera seu próprio plano na pasta `infra/terraform`, usando seu perfil SSO, suas configurações locais e o estado atual da conta AWS:

```powershell
# Gerar o plano; este comando ainda nao altera os recursos.
terraform plan -out=infra.tfplan

# Revisar o arquivo gerado no terminal.
terraform show infra.tfplan

# Aplicar exatamente o plano revisado.
terraform apply infra.tfplan
```

O `.tfplan` é um arquivo binário gerado, pode conter segredos e deve ficar somente na máquina em que será usado. Os nomes `infra.tfplan`, `update.tfplan`, `retomada.tfplan` e `destroy.tfplan` nos exemplos são arquivos locais, não arquivos que acompanham o repositório. Use a extensão `.tfplan` para que o `.gitignore` os exclua.

Depois de alterar o código, os parâmetros ou após uma falha, gere um novo plano. Não copie planos de outra máquina ou conta e não reutilize um plano antigo após mudanças no estado.

## 6. Primeiro acesso

Abra a URL de `app_url` e teste `/api/health`, que deve retornar `{"status":"ok"}`. Use o `admin_email` configurado e consulte a senha inicial no seu terminal privado:

**PowerShell:**

```powershell
$adminParameter = terraform output -raw admin_password_parameter
aws ssm get-parameter --profile projeto-aula --region us-east-2 --name $adminParameter --with-decryption --query Parameter.Value --output text
```

**CMD (Prompt de Comando):** consulte primeiro o nome do parâmetro:

```cmd
terraform output -raw admin_password_parameter
```

Copie o resultado e use em `--name`. Se retornar `/marmifit/admin-password`, execute:

```cmd
aws ssm get-parameter --profile projeto-aula --region us-east-2 --name "/marmifit/admin-password" --with-decryption --query Parameter.Value --output text
```

Substitua `projeto-aula` pelo seu perfil real e o caminho pelo resultado do output, caso tenha outro nome de projeto. Não use `$adminParameter` no CMD: ele seria enviado como texto literal.

Para consultar o e-mail e a URL, em qualquer um dos terminais:

```text
terraform output -raw admin_email
terraform output -raw app_url
```

Troque a senha em **Minha conta** após o login. O parâmetro guarda a senha inicial; ele não acompanha alterações feitas pela interface. Usuários da aplicação, usuário do PostgreSQL e perfil SSO são acessos separados. O JWT é persistente e compartilhado entre as réplicas.

Não publique senhas, tokens, plans ou estados: o estado Terraform contém segredos, mesmo quando marcados como sensíveis.

## 7. Atualizar a aplicação

Altere `backend_image`, `frontend_image` ou ambas no tfvars para imagens já publicadas:

```powershell
terraform plan -out=update.tfplan
terraform apply update.tfplan
```

O SSM atualiza os Deployments e aguarda o rollout. Uma troca somente de imagem não recria EC2/RDS. Para voltar de versão, restaure a referência anterior e aplique outro plano; isso não desfaz migrations ou dados do banco.

Para diagnóstico, consulte **Systems Manager → Run Command**. No master, via SSM:

```bash
sudo k3s kubectl get pods -n marmifit -o wide
sudo k3s kubectl logs -n marmifit deployment/backend --tail=100
```

### Retomar um apply interrompido

Os recursos criados antes da falha permanecem registrados no estado. Depois de corrigir o código, gere um plano novo e revise-o antes de aplicar:

```powershell
terraform validate
terraform plan -out=retomada.tfplan
terraform apply retomada.tfplan
```

Não reutilize o plano antigo após alterar o código nem execute `destroy` para resolver uma falha parcial. Mudanças no `user_data` podem recriar master/workers; confira no plano quais recursos serão substituídos antes de aplicar.

Se o SSM falhar, consulte o comando em **Systems Manager → Run Command**. Para erros na instalação inicial, execute no master via SSM:

```bash
sudo cloud-init status --long
sudo tail -n 80 /var/log/cloud-init-output.log
```

Os scripts informam a etapa em que falharam, sem imprimir segredos. Na AMI Amazon Linux 2023, a AWS CLI já está instalada; quando necessário, o nome correto do pacote é `awscli-2`. A configuração de rede dos workers fica na interface do launch template, evitando conflitos entre interface e security groups.

## 8. Remover o laboratório

```powershell
terraform plan -destroy -out=destroy.tfplan
terraform apply destroy.tfplan
```

Por padrão, o RDS é removido **sem snapshot final**. Configure `db_final_snapshot = true` antes se precisar preservá-lo. Um bucket de imagens não vazio impede sua exclusão; `images_force_destroy = true` permite remover também os objetos. O bucket de estado permanece. NAT, ALB, EC2, RDS, WAF e armazenamento geram custos enquanto existirem.

## Versionamento em infra/terraform

Copie para `infra/terraform/` os arquivos `.tf`, `.terraform.lock.hcl`, README, `.gitignore`, `.gitattributes`, exemplos e pastas `bootstrap`, `manifests`, `scripts`, `templates`, `tests` e `sql`, além de `schema.sql`. Inclua também o `.terraform.lock.hcl` do bootstrap.

O `.gitignore` desta pasta exclui configurações reais, estados, plans, credenciais e ferramentas locais. Não copie esses arquivos para o repositório. Se mudar a pasta de trabalho após concluir o apply, inicialize novamente o backend na nova localização; preserve o estado local do bootstrap em armazenamento seguro.

Antes do commit, confira a lista de arquivos:

```powershell
# A partir da raiz do repositorio aplicacao_tb_fnl_si:
git status --short --untracked-files=all -- infra/terraform
```

O `.gitignore` não remove arquivos já rastreados. Se um plano já estiver no controle de versão, remova somente seu rastreamento, preservando a cópia local (comando a partir da raiz do repositório):

```powershell
git rm --cached -- infra/terraform/infra.tfplan
```

Substitua o caminho pelo plano que estiver rastreado. Versione código, exemplos e `.terraform.lock.hcl` dos providers; esse lockfile não é um plano. Guarde configurações reais, estados e planos fora do Git.

Para conferir o código sem provisionar, use `terraform validate` e `terraform test` após inicializar os providers. Os testes são simulados e não substituem a validação real da aplicação na AWS.
