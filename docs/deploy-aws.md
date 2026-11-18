# Deploy na AWS — runbook (Terraform + K3s)

Arquitetura: [arquitetura-aws.png](arquitetura-aws.png) · Contrato com a infraestrutura: [infra/README.md](../infra/README.md) · Manifests: [k8s/README.md](../k8s/README.md) · Banco: [infra/database/README.md](../infra/database/README.md).

Resumo: o **Terraform** cria a rede, o ALB + WAF, o cluster **K3s** (1 master + 3 workers), o **RDS PostgreSQL** e os buckets S3. A aplicação é instalada no cluster com `kubectl apply -k`. Depois disso, cada push na `main` que passa no Quality Gate atualiza as imagens no cluster pela pipeline.

## 1. Provisionar a infraestrutura
```bash
cd infra/terraform
terraform init            # backend remoto no bucket S3 do state (com lock)
terraform plan -out plano
terraform apply plano
terraform output          # bucket de imagens, endpoint do RDS, instance-id do master, role OIDC, DNS do ALB
```

## 2. Acessar o master (sem SSH)
```bash
aws ssm start-session --target <instance-id-do-master>
sudo -i
kubectl get nodes          # master + 3 workers "Ready"
```
O `kubectl` do K3s já vem configurado no master (`/etc/rancher/k3s/k3s.yaml`, só root).

## 3. Instalar a aplicação
1. Copie a pasta `k8s/` do repositório para o master e preencha os valores `TROQUE` em `k8s/overlays/aws/kustomization.yaml` (usuário do Docker Hub, bucket, região) com os outputs do Terraform.
2. Crie o Secret, sem gravar senha em arquivo:
   ```bash
   kubectl create namespace marmifit
   kubectl -n marmifit create secret generic backend-secret \
     --from-literal=DATABASE_URL='postgres://<usuario>:<senha>@<endpoint-rds>:5432/marmifit' \
     --from-literal=JWT_SECRET="$(openssl rand -base64 48)" \
     --from-literal=ADMIN_EMAIL='<email-do-admin>' \
     --from-literal=ADMIN_PASSWORD='<senha-forte-temporaria>'
   ```
3. Aplique e acompanhe:
   ```bash
   kubectl apply -k k8s/overlays/aws
   kubectl -n marmifit rollout status deployment/backend
   kubectl -n marmifit get pods -o wide      # réplicas espalhadas pelos workers
   ```
   No primeiro start o backend cria as tabelas (migrations) e o admin.

## 4. Abrir a aplicação
- Endereço: `http://<DNS-do-ALB>` (output do Terraform). O Target Group deve mostrar os 3 workers *healthy* na porta 30080.
- Entre com o admin e **troque a senha em "Minha conta"** (a senha inicial esteve no comando do Secret — risco R11).

## 5. Pipeline (deploys seguintes)
GitHub Actions: testes → SonarQube (Quality Gate) + `npm audit` → build e push no Docker Hub (tag = SHA do commit) → deploy por **SSM Run Command** no master (`kubectl set image` + `rollout status`), autenticado por **OIDC** (ADR-15). O deploy só roda na `main`, com `vars.DEPLOY_ENABLED=true` e aprovação no environment `production`.
Rollback: `kubectl -n marmifit rollout undo deployment/backend` (e `frontend`).

## 6. Checklist pós-deploy
```bash
ALB=http://<DNS-do-ALB>
curl -s $ALB/api/health                                   # {"status":"ok"}
curl -sI $ALB/ | grep -iE "content-security|x-frame"      # headers de segurança
curl -s -o /dev/null -w "%{http_code}\n" "$ALB/api/restaurants?q=1'%20OR%20'1'='1"   # 403 = WAF bloqueou SQLi
```
- [ ] `/api/health` responde `ok` pelo ALB; os 3 workers *healthy* no Target Group
- [ ] Headers de segurança presentes (CSP, `X-Frame-Options`)
- [ ] WAF bloqueia uma tentativa simples de SQL injection (403) e aparece nas métricas da Web ACL
- [ ] RDS **não** é público (`publicly_accessible = false`); `psql` de fora da VPC não conecta
- [ ] Bucket de imagens: uma foto em `meals/...` abre pelo navegador; listar o bucket ou ler fora de `meals/` dá **AccessDenied**
- [ ] NetworkPolicy: um pod avulso não alcança o backend
      `kubectl -n marmifit run teste --rm -it --image=busybox --restart=Never -- wget -T 3 -qO- http://backend:3000/api/health` → *timeout*
- [ ] Nenhuma instância com IP público além do ALB/NAT; porta 22 fechada
- [ ] Senha do admin trocada após o primeiro login

## 7. Desligar (economizar o crédito)
```bash
# Antes: desligar deletion_protection do RDS (variável no Terraform) e aplicar
terraform destroy
```
Um snapshot final do RDS é mantido (`skip_final_snapshot = false`). Para subir de novo, volte ao passo 1 — é o mesmo procedimento do [plano de DR](continuidade/pcn-pri-dr.md#5-recuperação-de-desastres-dr--passo-a-passo).
