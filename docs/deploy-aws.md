# Deploy na AWS — roteiro manual (Aula 12)

> Sem IaC (ADR-07): passo a passo pelo Console AWS. Trocar local → nuvem é **só configuração** (RNF-02).

## Arquitetura alvo

```
                 Internet
                    │ HTTPS 443
             ┌──────▼───────┐
             │   AWS WAF    │  regras gerenciadas (SQLi, XSS, IPs ruins) + rate limit
             └──────┬───────┘
             ┌──────▼───────┐  subnets PÚBLICAS (2 AZs)
             │     ALB      │  certificado ACM, redireciona 80→443
             └──────┬───────┘
 ┌──────────────────▼─────────────────┐ subnet PÚBLICA
 │ EC2 pública — frontend (Nginx :80) │ SG: 80 só do SG do ALB
 └──────────────────┬─────────────────┘
                    │ :3000
 ┌──────────────────▼─────────────────┐ subnet PRIVADA (sem IP público)
 │ EC2 privada — backend (Node :3000) │ SG: 3000 só do SG da EC2 pública
 └───────┬─────────────────────┬──────┘
         │ :5432 (TLS)         │ HTTPS (VPC endpoint)
 ┌───────▼────────┐    ┌───────▼────────┐
 │ RDS PostgreSQL │    │  S3 (privado)  │──► CloudFront (leitura das imagens)
 │ subnet privada │    │  SSE + versão  │
 └────────────────┘    └────────────────┘
```

## 1. Rede (VPC)
1. **VPC** `marmifit-vpc` 10.0.0.0/16.
2. **Subnets:** públicas `10.0.1.0/24` (AZ a) e `10.0.3.0/24` (AZ b); privadas `10.0.2.0/24` (AZ a) e `10.0.4.0/24` (AZ b). O ALB e o RDS exigem 2 AZs.
3. **Internet Gateway** associado à VPC; rota `0.0.0.0/0 → IGW` só na tabela das subnets públicas.
4. **Saída da subnet privada** (baixar imagens do GHCR e atualizações): NAT Gateway na subnet pública *(tem custo; dá para criar só durante o deploy e apagar depois)*.
5. **VPC Gateway Endpoint para S3** na tabela de rotas privada (tráfego ao S3 não passa pela internet e é gratuito).

## 2. Security Groups (mínimo privilégio)
| SG | Entrada | Origem |
|---|---|---|
| `sg-alb` | 443, 80 | 0.0.0.0/0 |
| `sg-front` | 80 | `sg-alb` · 22 do seu IP (ou nenhum, usando SSM) |
| `sg-back` | 3000 | `sg-front` · 22 de `sg-front` (bastion) |
| `sg-rds` | 5432 | `sg-back` |

## 3. Banco — RDS PostgreSQL
- Engine PostgreSQL 16, `db.t4g.micro` (free tier), **subnet group privado**, *Public access: No*, SG `sg-rds`.
- **Encryption at rest** (KMS) habilitado; backups automáticos 7 dias.
- Banco `marmifit`, usuário `marmifit`, senha forte (guarde no Secrets Manager ou no `.env` com `chmod 600`).
- As migrations rodam sozinhas no primeiro start do backend.

## 4. Imagens — S3 + CloudFront
1. Bucket `marmifit-imagens-<sufixo>`: **Block all public access = ON**, versionamento ON, criptografia SSE-S3.
2. CloudFront com origem no bucket usando **OAC** (Origin Access Control) → a política do bucket libera leitura só para essa distribuição.
3. `S3_PUBLIC_URL=https://<id>.cloudfront.net` no `.env` do backend.

## 5. IAM Role da EC2 do backend (sem access keys!)
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::marmifit-imagens-<sufixo>/meals/*"
  }]
}
```
Anexe também `AmazonSSMManagedInstanceCore` para acessar sem SSH, se preferir.

## 6. EC2s (Ubuntu 24.04, t3.micro)
Em **ambas**:
```bash
sudo apt update && sudo apt -y upgrade && sudo apt -y install docker.io docker-compose-v2 unattended-upgrades
sudo usermod -aG docker ubuntu && sudo mkdir -p /opt/marmifit && sudo chown ubuntu /opt/marmifit
# Se o repositório for privado: docker login ghcr.io -u <usuario> (token com read:packages)
```
- **EC2 privada (backend):** subnet privada, SG `sg-back`, IAM Role do passo 5. Copie `deploy/compose.backend.yml` e crie `/opt/marmifit/.env` a partir de `deploy/backend.env.example`.
- **EC2 pública (frontend):** subnet pública, SG `sg-front`. Copie `deploy/compose.frontend.yml`.

Subir:
```bash
# privada
export GH_REPO=<usuario>/marmifit TAG=latest
docker compose -f compose.backend.yml up -d
# pública
export GH_REPO=<usuario>/marmifit TAG=latest BACKEND_IP=10.0.2.x
docker compose -f compose.frontend.yml up -d
```
Dica: coloque `GH_REPO` e `BACKEND_IP` em `/opt/marmifit/.env` — o compose lê esse arquivo automaticamente.

## 7. Load Balancer + WAF
1. **Target Group** HTTP:80 → EC2 pública; health check `GET /api/health` (verifica API **e** banco).
2. **ALB** internet-facing nas 2 subnets públicas, SG `sg-alb`. Listener 443 com certificado do **ACM**; listener 80 redireciona para 443.
3. **AWS WAF** (Web ACL) associada ao ALB:
   - `AWSManagedRulesCommonRuleSet` (OWASP geral, XSS)
   - `AWSManagedRulesSQLiRuleSet` (SQL injection)
   - `AWSManagedRulesKnownBadInputsRuleSet`
   - `AWSManagedRulesAmazonIpReputationList`
   - **Rate-based rule:** 100 req / 5 min por IP em `/api/auth/login` → *Block* (força bruta)
   - Regra de tamanho: body > 3 MB → *Block*
4. Teste: `curl "https://<alb>/api/restaurants?x=' OR 1=1--"` deve retornar **403** do WAF.

## 8. Pipeline → deploy automático
Em *Settings → Secrets and variables → Actions*:
| Nome | Tipo | Valor |
|---|---|---|
| `EC2_SSH_KEY` | secret | chave privada do par usado nas EC2s |
| `EC2_USER` | secret | `ubuntu` |
| `EC2_PUBLIC_HOST` | secret | IP/DNS público da EC2 do frontend |
| `EC2_PRIVATE_HOST` | secret | IP privado da EC2 do backend |
| `DEPLOY_ENABLED` | variable | `true` |

Crie o environment **production** com *Required reviewers* para exigir aprovação manual antes do deploy.

## 9. Checklist pós-deploy
- [ ] `https://<dominio>/api/health` → `{"status":"ok"}`
- [ ] RDS **sem** endpoint público; `nc -z <rds> 5432` de fora da VPC falha
- [ ] Bucket S3 inacessível diretamente; imagens carregam via CloudFront
- [ ] WAF bloqueando payload de SQLi de teste
- [ ] Senha do admin trocada após o primeiro login
- [ ] Snapshot manual do RDS criado
