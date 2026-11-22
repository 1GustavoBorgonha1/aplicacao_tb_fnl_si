# Infraestrutura — contrato entre a aplicação e o Terraform/K3s

Este documento diz **o que a aplicação MarmiFit precisa da AWS** e **o que a infraestrutura precisa devolver** para a aplicação funcionar. Quem faz o Terraform/K3s usa isto como checklist.

- Diagrama: [docs/arquitetura-aws.png](../docs/arquitetura-aws.png)
- Banco: [infra/database/README.md](database/README.md) (schema e configuração do RDS)
- Manifests do Kubernetes: [k8s/README.md](../k8s/README.md)

> O banco é **Amazon RDS PostgreSQL 16, porta 5432**, como no diagrama. A aplicação foi escrita e testada em PostgreSQL.

## 1. Visão geral

```
Internet → WAF → ALB (subnet pública) → Target Group HTTP :30080
                                           │
                    ┌──────────────────────┴───────────────────────┐
                    │  subnet privada — cluster K3s                 │
                    │  master (k3s server)  +  3 workers (agents)   │
                    │  pod frontend (Nginx) → pod backend (Node)    │
                    └──────────────────────┬───────────────────────┘
                                           │ 5432
                                     RDS PostgreSQL (subnet privada)

workers → NAT Gateway → Docker Hub (pull das imagens) / S3 (upload das fotos) / SSM
usuários → S3 de imagens (GET público só em meals/*)
```

## 2. Onde fica o código Terraform
- Pasta **`infra/terraform/`** neste repositório. Trabalhe numa branch e abra **PR para a `main`**: a pipeline roda `terraform fmt -check` e `terraform validate`, e o SonarQube analisa o código Terraform (regras de segurança de IaC).
- **Commitar:** `*.tf`, `.terraform.lock.hcl` (fixa a versão dos providers), `terraform.tfvars.example`.
- **Nunca commitar** (já bloqueado no `.gitignore`): `.terraform/`, `*.tfstate*`, `*.tfvars` com valores reais, chaves `.pem`, credenciais AWS.
- **State remoto** no bucket S3 do estado (o do diagrama): versionamento ligado, criptografia, acesso público bloqueado e **lock** (DynamoDB ou `use_lockfile` do backend S3). O state pode conter senhas — por isso nunca vai para o Git.

> **Dica para o K3s:** aplique o taint `node-role.kubernetes.io/control-plane:NoSchedule` no master para a aplicação rodar só nos 3 workers (como no diagrama). A topologia inteira foi validada localmente com k3d — veja `k8s/README.md`.

## 3. Rede e Security Groups
VPC com subnet **pública** (ALB, NAT Gateway) e **privada** (master, workers, RDS). Os nós do K3s não têm IP público.

| SG | Entrada (origem → porta) | Motivo |
|---|---|---|
| **SG-ALB** | Internet → TCP 80 (e 443 se houver domínio + certificado ACM) | Único ponto de entrada |
| **SG-Worker** | SG-ALB → TCP **30080** | NodePort do frontend (Target Group) |
| **SG-Worker** | SG-Master/SG-Worker → UDP **8472** | Rede dos pods (flannel VXLAN) |
| **SG-Worker** | SG-Master → TCP **10250** | Kubelet (logs, exec) |
| **SG-Master** | SG-Worker → TCP **6443** | API do Kubernetes (workers entrando no cluster) |
| **SG-Master** | SG-Worker → UDP **8472** e TCP **10250** | flannel / kubelet do master |
| **SG-RDS** | SG-Worker → TCP **5432** | Só os pods do backend acessam o banco |

- **Saída** dos nós: liberada via NAT (Docker Hub, S3, SSM, atualizações do SO).
- **Sem SSH aberto para a internet.** Acesso administrativo pelo **SSM Session Manager**.
- Dentro do cluster ainda existe a segmentação por **NetworkPolicy** (backend só aceita o frontend) — já está nos manifests.

## 4. Load Balancer e WAF
- **ALB** público, listener HTTP 80 (HTTPS 443 opcional com ACM).
- **Target Group**: tipo *instance*, protocolo HTTP, **porta 30080**, os **3 workers** registrados (pelo Auto Scaling Group do Launch Template).
- **Health check**: `GET /api/health`, porta 30080, sucesso = **200**. (Esse endpoint também testa a conexão com o banco.)
- **AWS WAF** (Web ACL associada ao ALB), regras gerenciadas:
  - `AWSManagedRulesCommonRuleSet`
  - `AWSManagedRulesSQLiRuleSet`
  - `AWSManagedRulesKnownBadInputsRuleSet`
  - **Rate-based rule** por IP (ex.: bloquear acima de algumas centenas de requisições em 5 min) — complementa o rate limit do Nginx e da API.
- A aplicação já trata o `X-Forwarded-For` do ALB (`TRUST_PROXY=2`), então os limites por IP usam o IP real do usuário.

## 5. S3
**Bucket de imagens das marmitas** (o "S3 público" do diagrama):
- Leitura pública **somente** no prefixo `meals/*` (bucket policy com `s3:GetObject` em `arn:aws:s3:::<bucket>/meals/*`). Nada de listar o bucket.
- *Block Public Access*: bloquear ACLs públicas (`block_public_acls`, `ignore_public_acls`); manter permitida apenas a bucket policy.
- Criptografia SSE-S3 (AES-256) — a aplicação já envia `ServerSideEncryption: AES256`.
- **Instance profile dos workers** (IAM Role) com `s3:PutObject` e `s3:DeleteObject` em `arn:aws:s3:::<bucket>/meals/*`. A aplicação usa a role da instância: **nenhuma access key** vai para a aplicação.

**Bucket do state do Terraform**: privado, versionado, criptografado (ver seção 2).

## 6. Banco (RDS PostgreSQL)
Resumo (detalhes em [database/README.md](database/README.md)): PostgreSQL 16, banco `marmifit`, porta 5432, subnet privada, `publicly_accessible = false`, SG só dos workers, `storage_encrypted`, `rds.force_ssl = 1`, backup de 7 dias, snapshot final, `deletion_protection`. **As tabelas são criadas pela própria aplicação** quando ela sobe.

## 7. Cluster K3s
- **Master** (`k3s server`) numa EC2 da subnet privada. Instalação pelo `user_data`.
- **Workers** (`k3s agent`) por **Launch Template + Auto Scaling Group** (3 instâncias), entrando no cluster com o **token do master** (`K3S_URL=https://<ip-privado-do-master>:6443`, `K3S_TOKEN=...`). Guarde o token no SSM Parameter Store (SecureString) em vez de deixá-lo em texto no Terraform.
- Todos os nós com o **SSM Agent** e a policy `AmazonSSMManagedInstanceCore`. Os workers também com a policy do S3 (seção 5).
- AMI sugerida: Ubuntu 24.04 ou Amazon Linux 2023.
- O K3s já traz o controlador de NetworkPolicy (usado pelos manifests).

## 8. Deploy pela pipeline (GitHub Actions → cluster)
O master fica na subnet privada, então o GitHub não acessa a API do Kubernetes direto. O último passo da pipeline usa **AWS SSM Run Command** no master:
```
kubectl -n marmifit set image deployment/backend  backend=<usuario>/marmifit-backend:<sha>
kubectl -n marmifit set image deployment/frontend frontend=<usuario>/marmifit-frontend:<sha>
kubectl -n marmifit rollout status deployment/backend
```
Para isso o Terraform cria:
- **OIDC provider** do GitHub (`token.actions.githubusercontent.com`) na conta AWS;
- **IAM Role** que o GitHub assume via OIDC, com *trust policy* restrita a este repositório (`repo:1GustavoBorgonha1/aplicacao_tb_fnl_si:*` ou só a `main`/environment `production`) e permissão `ssm:SendCommand` (documento `AWS-RunShellScript`) **apenas na instância do master**, mais `ssm:GetCommandInvocation`.
Sem chave SSH, sem access key no GitHub, sem porta aberta.

## 9. O que a infra precisa devolver (outputs do Terraform)
| Output | Usado em |
|---|---|
| Nome e região do **bucket de imagens** | `k8s/overlays/aws` (`S3_BUCKET`, `S3_PUBLIC_URL`, `AWS_REGION`) |
| **Endpoint do RDS** + usuário/senha da aplicação (senha por mensagem privada ou Secrets Manager) | Secret `backend-secret` (`DATABASE_URL`) |
| **Instance ID do master** | Secret/variable da pipeline para o SSM |
| **ARN da role OIDC** | Pipeline (assume a role) |
| **DNS do ALB** | Acessar a aplicação / apresentação |

## 10. Primeiro deploy da aplicação
No master (via SSM Session Manager):
1. Copiar a pasta `k8s/` do repositório e preencher os valores `TROQUE` em `k8s/overlays/aws/kustomization.yaml` com os outputs acima.
2. Criar o Secret (comando completo no topo do `kustomization.yaml`): `kubectl -n marmifit create secret generic backend-secret --from-literal=DATABASE_URL=... --from-literal=JWT_SECRET=... --from-literal=ADMIN_EMAIL=... --from-literal=ADMIN_PASSWORD=...`
3. `kubectl apply -k k8s/overlays/aws` e `kubectl -n marmifit get pods -o wide` (pods espalhados pelos workers).
4. Abrir o DNS do ALB → `/api/health` deve responder `{"status":"ok"}`. Trocar a senha do admin em **Minha conta**.

## 11. Custo (crédito de US$ 200)
- Os itens que mais pesam são os cobrados **por hora mesmo sem uso**: **NAT Gateway** e **ALB** (mais as EC2 e o RDS ligados).
- Tamanhos suficientes para a demo: EC2 `t3.small` (master) e `t3.micro`/`t3.small` (workers); RDS `db.t4g.micro`.
- Estratégia: **subir a infraestrutura perto da apresentação** e rodar `terraform destroy` logo depois (desligue antes o `deletion_protection` do RDS). Como tudo está em código, recriar leva minutos — esse é exatamente o argumento do **plano de DR**.
- Configure um **AWS Budget** com alerta por e-mail (ex.: em 50% e 80% do crédito).
