# OWASP Top 10 × Controles da MarmiFit (Aula 8)

Cada linha aponta **onde** o controle está implementado e **qual teste** o comprova.

| # | Categoria OWASP | Risco na MarmiFit | Controle implementado | Onde | Teste |
|---|---|---|---|---|---|
| A01 | **Broken Access Control** | Restaurante A editar marmita/pedido do B; cliente ver pedido de outro; acessar `/api/admin` forçando a URL | RBAC no servidor + verificação de dono em **toda** query (`WHERE restaurant_id = $req.restaurant.id`); ID do restaurante nunca vem do body; recurso alheio → 404 | `middlewares/auth.js`, `middlewares/restaurant.js`, `routes/*.js` | CA-001-08, CA-003-03, CA-004-05/06, CA-005-01 |
| A02 | **Falhas criptográficas** | Vazamento de senhas; token forjado | bcrypt custo 12; JWT HS256 com `algorithms` fixo (bloqueia `alg: none`); segredo ≥ 32 chars; TLS no ALB; RDS/S3 cifrados | `services/password.js`, `services/token.js` | CA-001-07 (alg none) |
| A03 | **Injeção** (SQLi, XSS) | `' OR 1=1 --` no login; script em nome de marmita | Queries 100% parametrizadas; validação zod; React escapa saída; CSP `script-src 'self'` | `db/pool.js`, `validate.js`, `nginx.conf` | CA-001-06 (SQLi) |
| A04 | **Design inseguro** | Cliente alterar o preço do pedido | Total recalculado no servidor; máquina de estados dos pedidos; specs com STRIDE antes do código (SDD) | `routes/orders.js`, `specs/` | CA-004-01, CA-004-07 |
| A05 | **Configuração incorreta** | Stack trace exposto; versão do servidor; banco exposto | Erros genéricos; `x-powered-by` e `server_tokens` desligados; headers de segurança; banco só na rede interna; containers `read_only` e `cap_drop: ALL`; no K3s: Pod Security `restricted`, `readOnlyRootFilesystem`, sem token de service account e **NetworkPolicy** (entrada negada por padrão); Security Groups em cadeia na AWS | `errorHandler.js`, `nginx.conf`, `docker-compose.yml`, `k8s/base/`, `infra/README.md` | "JSON malformado não vaza stack" |
| A06 | **Componentes vulneráveis** | Biblioteca com CVE | `npm audit --audit-level=high` bloqueia o pipeline; Dependabot semanal; SonarQube | `.github/workflows/ci.yml`, `.github/dependabot.yml` | Pipeline — **caso real:** o audit barrou o `zod 3` (GHSA-mrhx-c7xc-m3w5), corrigido migrando para o zod 4 |
| A07 | **Falhas de autenticação** | Força bruta (Hydra); enumeração de e-mails | Rate limit no app (5/15 min) **e** no Nginx (1 r/s); mensagem única de erro; tempo constante (hash dummy); política de senha; troca de senha exige a senha atual e **revoga as sessões anteriores** (versão do token, ADR-11) | `routes/auth.js`, `middlewares/auth.js`, `nginx.conf` | CA-001-04, CA-001-06, CA-001-10, CA-006-01 a CA-006-07 |
| A08 | **Integridade de software/dados** | Upload de `.php` disfarçado de imagem; pipeline adulterado | Validação por *magic bytes*; nome UUID; dependências só de `npm ci` com lockfile; permissões mínimas do `GITHUB_TOKEN`; imagens publicadas e implantadas pela **tag do commit (SHA)** — o cluster roda exatamente o que passou no Quality Gate; arquivos da imagem do Nginx com dono root (somente leitura); infraestrutura só muda por PR revisado (Terraform) | `middlewares/upload.js`, `ci.yml`, `frontend/Dockerfile`, `infra/terraform/` | CA-003-04, CA-003-05 |
| A09 | **Falhas de log e monitoramento** | Ataque passar despercebido; repúdio | Logs JSON com eventos de auditoria (`login_failed`, `password_changed`, `password_change_failed`, `order_status`, `admin_*`) e redação de segredos | `logger.js` | — (ver `docker compose logs backend \| grep audit`) |
| A10 | **SSRF** | — | A API não faz requisições a URLs fornecidas pelo usuário | — | — |

## Outros ataques vistos em aula

| Ataque | Mitigação |
|---|---|
| CSRF | Token no header `Authorization` (não em cookie) → o navegador não envia automaticamente |
| Path traversal / DIRB | `express.static` com `dotfiles: deny`; driver local valida que a key fica dentro de `UPLOAD_DIR`; Nginx bloqueia `/.*` |
| DoS / Slowloris / Slow HTTP (Aula 4) | Timeouts curtos no Nginx (`client_body_timeout`, `client_header_timeout`), `limit_req`, limite de body (100 kb JSON, 2 MB imagem); na AWS: WAF rate-based rule |
| Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| MITM | HTTPS no ALB (ACM) e `DATABASE_SSL=true` para o RDS |

## Como testar manualmente (ambiente local)
```bash
# SQLi no login → 400/401, nunca 200
curl -s -XPOST localhost:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"'"'"' OR 1=1 --","senha":"x"}'

# Força bruta → 429 após o limite
for i in $(seq 1 8); do curl -s -o /dev/null -w "%{http_code} " -XPOST localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"a@a.com","senha":"errada1"}'; done

# Headers de segurança
curl -sI localhost:8080/
```
Ferramentas da aula também podem ser apontadas para `http://localhost:8080` **apenas no ambiente local**: `sqlmap -u ... --data`, `dirb http://localhost:8080`, `nikto -h localhost -p 8080`.
