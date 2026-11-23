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
| Kubernetes | K3s em quatro EC2 privadas: um master e três workers gerenciados por ASG |
| Auto Scaling Group | Capacidade fixa de três workers, registro automático no ALB e substituição por falha de saúde |
| Aplicação | Frontend e backend separados, duas réplicas de cada por padrão |
| Entrada | ALB público, WAF e NodePort 30080; backend com Service interno |
| Saída | Um NAT Gateway e um Gateway Endpoint para S3 |
| Banco | RDS PostgreSQL 16 privado, Single-AZ, criptografado; acesso do master e workers |
| Imagens | Bucket S3 com leitura pública somente em `meals/*`; escrita autenticada |
| Estado | Outro bucket S3, privado, versionado e criptografado, com lock nativo |
| Administração | Systems Manager; sem SSH público ou IP público nas EC2 |
| Segredos | Senha do banco, senha inicial do admin e JWT no Parameter Store |
| Deploy GitHub | Provider IAM OIDC e role restrita ao repositório/environment, com envio de comando SSM somente ao master |

Master, workers e RDS ficam na primeira zona. A segunda atende aos requisitos do ALB e do grupo de subnets do RDS. É um laboratório com master, NAT e banco únicos. O acesso é por HTTP no DNS do ALB; as imagens são lidas diretamente do S3 por HTTPS.

O WAF possui Common Rule Set, SQLi Rule Set, Known Bad Inputs e limite por IP, com tratamento de tamanho para permitir os uploads da aplicação. Os manifests mantêm containers sem root, NetworkPolicies e limites de recursos. O frontend não recebe os segredos do backend.

### Proteções do WAF

A Web ACL regional continua associada ao ALB, com as seguintes prioridades:

| Prioridade | Regra | Função |
|---|---|---|
| 1 | `AWSManagedRulesCommonRuleSet` | Proteções comuns de aplicações web |
| 2 | `BlockLargeBodiesOutsideUploads` | Preserva o bloqueio de corpos grandes fora das rotas de upload previstas |
| 3 | `RateLimit` | Limite de requisições por IP |
| 4 | `AWSManagedRulesSQLiRuleSet` | Inspeção de padrões de SQL injection |
| 5 | `AWSManagedRulesKnownBadInputsRuleSet` | Inspeção de entradas associadas à exploração de vulnerabilidades |

Os grupos usam `vendor_name = "AWS"` e `override_action = none`, preservando as ações definidas pela AWS para suas regras. Isso não coloca os grupos inteiros em Count nem força Block em regras que a AWS definiu como Count. A exceção de upload continua limitada ao tamanho do corpo no Common Rule Set; os novos grupos também inspecionam essas rotas, sem exclusões gerais. No ALB, a inspeção do corpo pelo WAF é limitada aos primeiros 8 KiB; ela não valida o conteúdo completo de uma foto. A aplicação mantém a validação do tipo e tamanho da imagem.

Cada regra possui métricas próprias no CloudWatch e amostragem de requisições. Após provisionar, consulte **WAF & Shield → Web ACLs → marmifit-waf**, escolhendo a região do ambiente e o nome real do projeto. Examine métricas e requisições amostradas ao investigar respostas 403. Esta entrega não cria um destino de logs completos do WAF.

A validação local confirma a configuração das regras, não a detecção de ataques reais. Após um provisionamento autorizado, valide login, cadastro e upload legítimos e faça testes controlados de SQL injection no próprio laboratório, conferindo no WAF qual regra correspondeu à requisição. Não basta observar um HTTP 403, pois a aplicação também pode negar o acesso. Caso uma requisição legítima seja bloqueada, investigue a regra específica antes de propor uma exceção.

Essas proteções complementam as consultas parametrizadas e validações do backend. Não há novo parâmetro obrigatório em `terraform.tfvars` ou `backend.hcl`.

Referências: [grupo SQLi](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-use-case.html), [grupos Common e Known Bad Inputs](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html).

### Workers e recuperação automática

O `aws_autoscaling_group.workers` usa o launch template com `min_size = max_size = desired_capacity = 3`, na primeira subnet privada. Ele registra seus workers no target group do ALB e substitui instâncias reprovadas nos health checks EC2/ELB. Não é necessário executar Terraform a cada substituição. O `user_data` instala o agente K3s e obtém o token no Parameter Store; `with-node-id` evita colisões se outra EC2 reutilizar um IP ou hostname. Os pods podem ser reagendados pelo Kubernetes nos workers disponíveis.

O health check do ALB usa **`/`**, servido pelo frontend Nginx. A rota **`/api/health`** continua disponível para testar backend e banco, mas não é usada para decidir a substituição das EC2: uma falha do RDS não deve causar recriação dos workers.

No primeiro provisionamento, a aplicação ainda não existe quando o ASG é criado. Por isso o Terraform não aguarda targets saudáveis dentro da criação do grupo (`wait_for_capacity_timeout = "0"`); o passo SSM seguinte aguarda três workers `Ready` e os rollouts da aplicação. A carência `worker_health_check_grace_period`, de **1.800 segundos** por padrão, dá tempo ao bootstrap e ao deploy antes de substituições baseadas no ALB. Aumente o valor se o primeiro provisionamento demorar mais que 30 minutos.

Mudanças na versão numérica do launch template iniciam um **instance refresh** gradual: mínimo saudável de 66%, máximo de 100%, aquecimento de 300 segundos e preservação das instâncias que já correspondem à versão desejada. O refresh é assíncrono e pode continuar depois do término do Terraform; acompanhe-o na aba Instance refresh do grupo no console AWS. A capacidade fixa não configura aumento por demanda, e o master continua sendo único.

Os outputs agora são `workers_autoscaling_group_name` e `workers_autoscaling_group_arn`. O output antigo `worker_instance_ids` foi removido, pois os IDs das EC2 mudam conforme o ASG substitui os workers. Para consultar o grupo após provisionar:

```powershell
terraform output -raw workers_autoscaling_group_name
aws autoscaling describe-auto-scaling-groups --profile projeto-aula --region us-east-2 --auto-scaling-group-names marmifit-workers --query "AutoScalingGroups[0].Instances[].[InstanceId,HealthStatus,LifecycleState]" --output table
```

Substitua perfil e nome do grupo pelos valores do seu ambiente. Para testar a recuperação em um laboratório já provisionado, registre os IDs atuais, interrompa uma EC2 worker pelo console e acompanhe a substituição no ASG, o registro do novo target no ALB e a entrada do novo nó no K3s. Aguarde o retorno a três workers ativos e valide a aplicação. Esse teste altera a AWS e não faz parte dos testes locais simulados.

Como o ambiente atual foi removido, o próximo provisionamento já criará o ASG. Se este código for usado sobre uma instalação antiga com workers fixos, o plano removerá essas instâncias e seus attachments individuais e criará o grupo; revise esse plano e considere possível interrupção. RDS, buckets e master não são alvo dessa troca.

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

O administrador precisa cadastrar seu usuário no IAM Identity Center e atribuir um permission set à conta de destino. Solicite **URL do portal SSO, região do Identity Center e ID da conta**. As permissões devem cobrir EC2/VPC/Auto Scaling, ALB, WAF, RDS, S3, SSM e IAM, incluindo `iam:PassRole`.

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

Os scripts informam a etapa em que falharam, sem imprimir segredos. Na AMI Amazon Linux 2023, a AWS CLI já está instalada; quando necessário, o nome correto do pacote é `awscli-2`. A subnet dos workers é definida no ASG; os security groups e a opção de IP público ficam na interface do launch template, evitando configurações de rede duplicadas.

### Ativar o deploy da aplicação pelo GitHub Actions (OIDC)

O workflow existente em `.github/workflows/ci.yml` já usa OIDC, environment `production` e SSM para trocar as imagens. O Terraform cria a confiança e a role; não configura variáveis nem permissões do repositório GitHub. Nenhuma access key é necessária no GitHub. O primeiro provisionamento/deploy continua pelo Terraform; depois a pipeline pode atualizar as imagens sem executar o script PowerShell local.

**1. Conferir os novos parâmetros no `terraform.tfvars` final:**

```hcl
github_repository        = "1GustavoBorgonha1/aplicacao_tb_fnl_si"
github_environment       = "production"
github_oidc_provider_arn = null
```

Esses são os padrões, então podem ser omitidos se forem adequados ao ambiente. Não há alteração no `backend.hcl`.

Com `github_oidc_provider_arn = null`, o Terraform cria o provider `https://token.actions.githubusercontent.com`, com audience `sts.amazonaws.com`. Existe somente um cadastro por URL em cada conta IAM. Antes de provisionar, confira em IAM → Identity providers se ele já existe. Nesse caso, informe seu ARN no parâmetro em vez de tentar criar outro:

```hcl
# Exemplo fictício: substitua o ID da conta pelo seu.
github_oidc_provider_arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
```

O provider reutilizado é apenas consultado e deve pertencer à mesma conta, ter o emissor correto e aceitar `sts.amazonaws.com`. Ele não será removido pelo destroy deste projeto. Um provider criado pelo próprio Terraform pertence ao ciclo de vida desta infraestrutura.

A confiança usa `StringEquals` para audience e subject exatos: `repo:1GustavoBorgonha1/aplicacao_tb_fnl_si:environment:production`. Forks e outros environments não são autorizados pelo padrão. Como o job usa um environment, o subject não contém a branch; a restrição à `main` precisa ser feita no GitHub. Ao alterar repositório/environment, mantenha os nomes coerentes com o workflow real. O workflow atual usa namespace `marmifit`; mantenha esse `project_name` ou peça ao responsável pelo workflow para ajustar o namespace.

**2. Provisionar e concluir o primeiro deploy:** gere e revise um plano novo e execute o apply, conforme a seção de provisionamento. Depois consulte:

```powershell
terraform output -raw github_deploy_role_arn
terraform output -raw master_instance_id
```

**3. Configurar o GitHub, com ajuda de um administrador do repositório:**

- Em **Settings → Environments**, criar/conferir `production` e configurar **Deployment branches and tags** para permitir somente a branch `main`. Se forem exigidos reviewers, cada deploy aguardará essa aprovação.
- Em **Settings → Secrets and variables → Actions → Variables** (ou nas variáveis do environment `production`), preencher:

| Variável | Valor |
|---|---|
| `AWS_REGION` | `us-east-2` |
| `AWS_DEPLOY_ROLE_ARN` | Output `github_deploy_role_arn` |
| `K3S_MASTER_INSTANCE_ID` | Output `master_instance_id` |
| `DEPLOY_ENABLED` | `true`, somente após a infraestrutura e o primeiro deploy estarem prontos |

Não são secrets de credenciais: o login usa um token OIDC temporário. A pipeline ainda depende das configurações de build, publicação das imagens e verificações já existentes no repositório. Quem não tem permissão de escrita/administração precisa solicitar essa configuração ao responsável pelo projeto. Se o master for recriado, atualize `K3S_MASTER_INSTANCE_ID` com o novo output.

**4. Validar a integração:** após um merge na `main` com os jobs anteriores aprovados, conferir no Actions o job Deploy e seu comando SSM. O job deve assumir a role, executar `kubectl set image` nos deployments backend/frontend e acompanhar os rollouts. Este teste precisa da infraestrutura provisionada; os testes locais simulados não comprovam autenticação real no GitHub/AWS.

A role permite somente `ssm:SendCommand` para o ARN do master e para o documento AWS `AWS-RunShellScript`, além de `ssm:GetCommandInvocation` com `Resource = "*"`, exigido por essa ação sem suporte a ARN. Não concede administração de EC2, IAM, RDS, S3 ou acesso direto aos parâmetros. O documento permite executar shell no master; por isso a confiança no repositório e a proteção do environment são parte da configuração do deploy.

Uma execução posterior do deploy inicial pelo Terraform pode reaplicar as imagens declaradas no tfvars. Mantenha `backend_image` e `frontend_image` coerentes com a versão desejada antes de aplicar mudanças que reexecutem esse passo. A pipeline muda as imagens em execução, mas não edita seu tfvars local.

Referências: [OIDC AWS no GitHub Actions](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [permissões SSM](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ssm.html).

## 8. Proteção, recuperação e remoção do laboratório

O banco novo usa PostgreSQL privado, backups automáticos com retenção de **7 dias**, proteção contra exclusão e snapshot final habilitados. No seu `terraform.tfvars` final, atualize também os valores antigos: valores explícitos prevalecem sobre os defaults do código.

```hcl
db_backup_retention_days = 7
db_final_snapshot = true
db_deletion_protection = true
db_final_snapshot_identifier = null
```

`db_deletion_protection` e `db_final_snapshot_identifier` são parâmetros novos. Com `null`, o nome do snapshot final será `<project_name>-final-<sufixo aleatório>`. Você pode informar um nome próprio válido e ainda não utilizado no RDS. Se um snapshot com o mesmo nome já existir, escolha outro nome antes de remover o banco, preservando o snapshot anterior. O `backend.hcl` não muda nesta entrega.

### Recuperar dados

Recriar a infraestrutura e executar o schema inicializa um banco novo; **não restaura os dados anteriores**. Para recuperar dados, no console RDS da mesma região selecione o snapshot manual/final e escolha **Restore snapshot**, ou selecione o banco e use **Restore to point in time** dentro da janela disponível de backups automáticos. A restauração cria outra instância, com outro endpoint: selecione a VPC, o subnet group e o security group privados deste projeto e mantenha acesso público desabilitado.

Antes de conectar a aplicação ao banco restaurado, confira os dados e reconcilie a instância restaurada com o recurso Terraform (configuração e importação), as credenciais no SSM e o `DATABASE_URL` do Secret da aplicação. Essa integração exige um plano de recuperação específico; não basta executar o apply atual, que não recebe um snapshot de origem. A E4 prepara a preservação dos dados e documenta a recuperação manual, sem automatizar a restauração ou comprovar um tempo de recuperação.

Os backups automáticos protegem a janela configurada enquanto o banco existe. Esta configuração mantem o comportamento padrão de excluir os backups automáticos ao remover a instância; o snapshot final é a cópia preservada após essa remoção. Snapshots finais persistem até sua exclusão manual e podem gerar custos de armazenamento. Guarde também o estado Terraform e as credenciais necessárias a recuperação em local seguro.

### Remover o laboratório

A remoção exige duas etapas. Primeiro, altere **somente** `db_deletion_protection = false` no seu tfvars, mantenha `db_final_snapshot = true` e aplique essa mudança no banco existente:

```powershell
terraform plan -out=desproteger.tfplan
terraform apply desproteger.tfplan
```

Confira que o plano desativa a proteção no RDS. Somente após concluir esse apply, gere e revise o plano de remoção:

```powershell
terraform plan -destroy -out=destroy.tfplan
terraform apply destroy.tfplan
```

Passar a variável apenas ao comando de destroy não altera previamente a proteção existente na AWS. Após a remoção, confira no RDS que o snapshot final está disponível. Antes de provisionar um novo laboratório, restaure `db_deletion_protection = true` no tfvars.

Um bucket de imagens não vazio impede sua exclusão; `images_force_destroy = true` permite remover também os objetos. O bucket de estado permanece. NAT, ALB, EC2, RDS, WAF e armazenamento geram custos enquanto existirem.

Referencias: [exclusão e snapshot final do RDS](https://docs.aws.amazon.com/AmazonRDS/latest/APIReference/API_DeleteDBInstance.html), [restaurar um snapshot](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_RestoreFromSnapshot.html).

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
