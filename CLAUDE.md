# CLAUDE.md — MarmiFit

Guia para agentes (Claude Code) e desenvolvedores que trabalham neste repositório.
Para a visão do usuário/avaliador, veja o [README.md](README.md).

## O que é o projeto

Marketplace simples de **marmitas fitness**: restaurantes cadastram marmitas, clientes escolhem um restaurante, montam o pedido e **retiram no local** (pagamento na retirada — o sistema **não** processa nem guarda dados de pagamento, e **não há entrega**).

Contexto acadêmico: trabalho de **Auditoria e Segurança de Sistemas** (UNIDAVI), atividade da Aula 7 — SSDLC: sistema simples feito com **SDD**, em Docker, com pipeline GitHub Actions e **scanner de segurança (SonarQube)** no deploy, preparado para AWS (EC2 pública + privada, RDS, S3, ALB + WAF). A ideia de negócio vem do trabalho de Empreendedorismo & Inovação. Segurança é o critério de avaliação: toda mudança deve preservar ou reforçar os controles existentes.

### Perfis
| Perfil | Pode |
|---|---|
| visitante | Cadastrar-se como cliente ou empresa; login |
| `cliente` | Listar restaurantes aprovados, ver catálogo, fazer/cancelar pedidos próprios |
| `restaurante` | Editar a própria empresa, CRUD das próprias marmitas (com foto), atender pedidos próprios |
| `admin` | Aprovar/bloquear empresas, ativar/desativar usuários, ver tudo, ocultar marmitas. Criado só via seed (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) |

Empresa nova nasce `pendente`; só `aprovado` aparece para clientes; `bloqueado` recebe 403 nas rotas de gestão.
Pedido: `recebido → em_preparo → pronto_retirada → retirado`, ou `cancelado` (cliente só em `recebido`; restaurante em `recebido`/`em_preparo`).

## Decisões fixas (não reverter sem o usuário pedir)
- **SonarQube** é o scanner de segurança. **Não usar Trivy.**
- **Sem Terraform/IaC**: a AWS é provisionada manualmente seguindo `docs/deploy-aws.md`.
- Imagens em **pasta local** no dev (`STORAGE_DRIVER=local`) e **S3** na AWS; Postgres em container no dev e **RDS** na AWS. A troca é **só por variável de ambiente**, nunca por mudança de código.
- Stack: Node 22 + Express 5 (backend), React 19 + Vite + React Router 7 (frontend), Postgres 16, zod 4.
- Documentação e textos da UI em **português**.

## Começando em uma máquina nova

Pré-requisitos: Git, Docker + Docker Compose v2 e Node 22 (Node só é necessário para rodar lint/testes fora do container). Opcional: `gh` (GitHub CLI) autenticado na conta `1GustavoBorgonha1`.

```bash
git clone https://github.com/1GustavoBorgonha1/aplicacao_tb_fnl_si.git marmifit
cd marmifit
cp .env.example .env            # preencha seguindo a seção abaixo
docker compose up -d --build    # http://localhost:8080
docker compose ps               # db, backend e frontend devem ficar "healthy"
# Para rodar lint/testes no host:
(cd backend && npm ci) && (cd frontend && npm ci)
```
O `.env`, o `node_modules/` e os volumes Docker (banco e imagens) **não** vão pelo git: a máquina nova começa com o banco vazio e só o admin do seed.

## Preencher o `.env` (passo a passo)

O `.env` fica na raiz, é lido pelo `docker-compose.yml` e **nunca é commitado**. O compose recusa subir se `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_EMAIL` ou `ADMIN_PASSWORD` estiverem vazios, e o backend recusa iniciar se o `JWT_SECRET` tiver menos de 32 caracteres.

1. **Copie o modelo:** `cp .env.example .env`
2. **`APP_PORT`**: porta do navegador. Deixe `8080`; troque só se a 8080 estiver ocupada (ex.: `8081` → acesse `http://localhost:8081`).
3. **`POSTGRES_DB` / `POSTGRES_USER`**: deixe `marmifit` / `marmifit`.
4. **`POSTGRES_PASSWORD`**: gere uma senha aleatória:
   ```bash
   openssl rand -hex 16
   ```
   ⚠️ A senha é gravada no volume do banco **na primeira subida**. Se trocar depois, o backend não conecta mais. Para recomeçar do zero (apaga os dados): `docker compose down -v` e suba de novo.
5. **`JWT_SECRET`**: segredo que assina os tokens de login. Mínimo de 32 caracteres:
   ```bash
   openssl rand -base64 48
   ```
   Trocar esse valor desloga todo mundo (é o procedimento de incidente para segredo vazado).
6. **`ADMIN_EMAIL` / `ADMIN_PASSWORD`**: credenciais do admin, criado automaticamente no primeiro start se o e-mail ainda não existir. A senha precisa ter 8+ caracteres, com letras e números. Alterar esses valores depois **não** muda o admin já criado: ele só é criado uma vez.
7. **Gerar tudo de uma vez** (opcional, Linux/macOS):
   ```bash
   sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" \
       -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')|" \
       .env.example > .env
   ```
   Depois edite `ADMIN_EMAIL`/`ADMIN_PASSWORD` se quiser outros valores.
8. **Conferir:** `docker compose config >/dev/null && echo ok` (acusa variável faltando) → `docker compose up -d --build` → `curl localhost:8080/api/health` deve responder `{"status":"ok"}` → login com o admin.

Variáveis que existem só no backend e já têm default (não precisam ir no `.env` local): `JWT_EXPIRES_IN=2h`, `BCRYPT_COST=12`, `LOGIN_RATE_LIMIT=5`, `LOGIN_RATE_WINDOW_MIN=15`, `TRUST_PROXY=1`, `LOG_LEVEL=info`, `STORAGE_DRIVER=local`. Lista completa e validação em `backend/src/config.js`.

**Na AWS** o `.env` é outro: na EC2 privada use `deploy/backend.env.example` (`DATABASE_URL` do RDS, `S3_BUCKET`, `S3_PUBLIC_URL` do CloudFront, `chmod 600`). Na EC2 pública, defina `GH_REPO=1gustavoborgonha1/aplicacao_tb_fnl_si` e `BACKEND_IP=<ip privado do backend>`. Veja `docs/deploy-aws.md`.

## Comandos

```bash
# Subir tudo (http://localhost:8080) — exige .env (cp .env.example .env)
docker compose up -d --build
docker compose logs -f backend            # logs JSON; eventos de auditoria têm "audit":true

# Testes de integração em container (Postgres descartável)
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f docker-compose.test.yml down -v

# Testes direto no host (precisa de um Postgres acessível)
docker run -d --rm --name marmifit-testdb -e POSTGRES_USER=marmifit -e POSTGRES_PASSWORD=marmifit \
  -e POSTGRES_DB=marmifit_test -p 127.0.0.1:55432:5432 postgres:16-alpine
cd backend && DATABASE_URL=postgres://marmifit:marmifit@127.0.0.1:55432/marmifit_test npm test
npm run test:coverage                     # gera backend/coverage/lcov.info (usado pelo SonarQube)
npm run lint                              # ESLint (flat config)

# Frontend
cd frontend && npm run build              # deve compilar sem erros
npm run dev                               # :5173, proxy /api e /uploads → :3000

# Auditoria de dependências (o CI falha em high/critical)
npm audit --omit=dev --audit-level=high   # rodar em backend/ e frontend/
```

Antes de considerar uma tarefa pronta: `npm run lint` e os testes do backend verdes, `npm run build` do frontend ok e `npm audit` sem high/critical.

**SonarQube local** (`docker-compose.sonar.yml`) precisa de ~2–3 GB de RAM livres e de `vm.max_map_count ≥ 524288`. Na máquina original (6 GB) o usuário interrompeu a tentativa; prefira a análise do CI e só suba localmente se a máquina aguentar e o usuário concordar.

## Estrutura

```
.specify/memory/constitution.md   princípios inegociáveis (ler antes de mudar algo relevante)
specs/NNN-nome/{spec,plan,tasks}.md   SDD — fonte da verdade de cada funcionalidade
  000-arquitetura  001-autenticacao  002-restaurantes  003-marmitas  004-pedidos  005-admin  _template
backend/
  src/app.js            createApp({ loginLimit, loginWindowMin }) — monta middlewares e rotas
  src/server.js         migrate() → seedAdmin() → listen; shutdown gracioso
  src/config.js         env validado com zod; falha no startup se inválido (JWT_SECRET ≥ 32)
  src/logger.js         pino com redact + audit(event, data)
  src/validate.js       parse(schema, data) → 400 com detalhes; parseId; texto(min,max); locale pt do zod
  src/errors.js         HttpError + badRequest/unauthorized/forbidden/notFound/conflict
  src/db/               pool.js (query, withTransaction), migrate.js, seed.js
  src/middlewares/      auth.js (requireAuth, requireRole), restaurant.js (loadRestaurant),
                        upload.js (multer memória + detectImageType), errorHandler.js
  src/services/         password.js (bcrypt), token.js (JWT HS256)
  src/storage/          index.js escolhe local.js | s3.js — interface save/remove/url
  src/routes/           auth, restaurants, meals, orders, admin
  migrations/NNN_*.sql  aplicadas em ordem, uma vez (tabela schema_migrations)
  tests/                vitest + supertest contra Postgres real; helpers.js tem fábricas
frontend/
  src/api.js            fetch único (token no sessionStorage) + errorText
  src/auth.jsx          AuthProvider, useAuth, <Protected role>
  src/components/       Layout, ui.jsx (Alert, Field, Badge, useLoad), PedidoCard, StatusEmpresa
  src/pages/            Home, Login, Cadastro*, cliente/, restaurante/, admin/Painel.jsx
  nginx.conf + proxy.inc + security-headers.inc
docs/seguranca/         política/LGPD, OWASP, matriz de riscos, hardening, criptografia
docs/continuidade/      PCN, resposta a incidentes, DR
docs/deploy-aws.md      roteiro manual da AWS
deploy/                 compose.backend.yml (EC2 privada), compose.frontend.yml (EC2 pública)
.github/workflows/ci.yml   test → sonarqube (Quality Gate) + audit → build (GHCR) → deploy
```

## Fluxo de trabalho SDD (obrigatório)

1. **Nova funcionalidade:** copie `specs/_template/` para `specs/NNN-nome/` (próximo número livre).
2. Escreva `spec.md` com histórias (`HU-NNN-xx`), critérios de aceite (`CA-NNN-xx`), requisitos de segurança (`RS-NNN-xx`) e tabela STRIDE. Depois o `plan.md` (endpoints, validação, arquivos, dependências novas com justificativa) e o `tasks.md`.
3. Só então implemente. Cada `CA` precisa de pelo menos um teste cujo nome comece pelo ID, por exemplo `it('CA-004-01 total é calculado no servidor', ...)`.
4. **Mudou o comportamento?** Atualize a spec primeiro, depois o código.
5. Decisão de arquitetura relevante → novo ADR em `specs/000-arquitetura/plan.md` (próximo ADR-NN).
6. Se a mudança afeta segurança, atualize `docs/seguranca/owasp-mitigacoes.md` e/ou `matriz-riscos.md`.

## Regras de segurança do código (da constituição)

- **Toda entrada externa passa por zod** via `parse(schema, req.body|req.query)`; IDs de rota via `parseId`. Campos desconhecidos são descartados (é isso que impede `role: "admin"` no cadastro).
- **SQL só parametrizado** (`$1, $2…`). Filtros opcionais usam `($2::text IS NULL OR col = $2)`, nunca concatenação. O `where` de `fetchOrders` recebe apenas texto fixo com placeholders.
- **Autorização no servidor, com dono do recurso:** o restaurante vem de `req.restaurant` (`loadRestaurant`), o cliente de `req.user.id`, **nunca do body/params**. Toda query de recurso próprio inclui `AND restaurant_id = $x` / `AND cliente_id = $x`. Recurso de outro dono → **404** (não 403), para não revelar existência.
- `requireAuth` relê o usuário no banco a cada requisição (usuário desativado perde acesso na hora; a role vem do banco, não do token).
- **Valores monetários em centavos (inteiro)**; o total do pedido é sempre recalculado com preços do banco.
- Upload: tipo validado por **magic bytes** (`detectImageType`), limite de 2 MB, nome UUID gerado pelo storage. Ao trocar ou remover imagem, apague o arquivo antigo; se o INSERT/UPDATE falhar, remova o recém-salvo.
- Erros: lance `HttpError` (helpers de `errors.js`); o `errorHandler` responde `{ erro, detalhes? }` e esconde detalhes de 500. Nunca devolva `senha_hash` nem logue senha/token (o pino já redige `senha`, `token`, `authorization`).
- Ações relevantes (login, mudança de status, ações de admin, CRUD de marmita) chamam `audit('evento', {...})`.
- Segredos só por variável de ambiente. `.env` é ignorado pelo git; nunca crie arquivos com segredos reais versionados.
- Frontend: nada de `dangerouslySetInnerHTML`, `eval` ou estilos/scripts inline (a CSP é `script-src 'self'; style-src 'self'`). A proteção de rotas no React é só UX.

## Convenções

- Backend em **ESM** (`"type": "module"`), imports com extensão `.js`.
- Express 5: erros lançados em handlers `async` vão direto ao `errorHandler`, sem `try/catch` nem `next(err)`.
- Cada router é uma função `xxxRouter()` montada em `app.js`. Rotas fixas (`/me`, `/mine`, `/received`) são declaradas **antes** de `/:id`.
- Respostas embrulhadas em objeto com nome em português: `{ restaurantes }`, `{ marmita }`, `{ pedidos }`, `{ usuario }`.
- Nomes de colunas, campos e mensagens em português (`preco_centavos`, `retirada_em`, `'Pedido não encontrado'`).
- Nova tabela ou coluna: crie `migrations/00N_descricao.sql`. **Nunca edite uma migration já aplicada.**
- Nova dependência: justifique no `plan.md` da spec e confirme que o `npm audit` continua limpo.

## Testes — o que você precisa saber

- Rodam **sequencialmente** (`fileParallelism: false`) num banco compartilhado; cada arquivo faz `beforeEach(resetDb)` (TRUNCATE + seed do admin) e `afterAll(() => pool.end())`.
- `tests/setup-env.js` define env padrão (bcrypt custo 4, `LOGIN_RATE_LIMIT=1000`, uploads em tmp). Para testar o rate limit, crie outro app: `createApp({ loginLimit: 3 })`.
- Fábricas em `tests/helpers.js`: `createCliente()`, `createRestaurante({ aprovar })`, `createMeal(token, campos)`, `loginAdmin()`, `futuro(min)`, `PNG`.
- **Armadilha:** os dados de teste precisam ser válidos em todos os campos que não estão sob teste (ex.: `nome` tem no mínimo 2 caracteres). Senão o teste passa com 400 "pelo motivo errado".
- Path traversal em `/uploads` retorna **403** (do módulo `send`) ou 404; os testes aceitam os dois.

## Armadilhas conhecidas

- **Nginx:** `add_header` não é herdado por um `location` que define o seu próprio. Em todo bloco com `add_header`, inclua `/etc/nginx/conf.d/security-headers.inc`. Os headers equivalentes do helmet são removidos no proxy (`proxy_hide_header` em `proxy.inc`) para não duplicar.
- O container do frontend é `read_only`. Não use templates com `envsubst` do Nginx, porque eles escrevem em `conf.d`. Na AWS, o nome `backend` é resolvido via `extra_hosts` (`deploy/compose.frontend.yml`).
- `TRUST_PROXY`: 1 localmente (Nginx), 2 na AWS (ALB + Nginx). O Nginx usa `real_ip` para limitar por IP do cliente.
- `docker-compose.test.yml` **não** monta `coverage/` (o vitest tenta apagar a pasta e falha com EBUSY num ponto de montagem).
- zod 4: use `z.flattenError(err)` (não `err.flatten()`); o locale `pt` é configurado em `validate.js`. O zod 3 foi barrado pelo `npm audit` (GHSA-mrhx-c7xc-m3w5) — não faça downgrade.
- O host do usuário tem um Postgres próprio em `127.0.0.1:5432`; ele não tem relação com o projeto (o container `db` não publica porta). Para testes no host, use outra porta (55432).

## CI/CD

`.github/workflows/ci.yml`: `test` (Postgres de serviço, lint, cobertura, build do front) → `sonarqube` (`sonar.qualitygate.wait=true`: gate reprovado falha o job) e `audit` → `build` (imagens no GHCR, push só fora de PR) → `deploy` (só na `main` com `vars.DEPLOY_ENABLED == 'true'`, environment `production`, SSH com ProxyJump para a EC2 privada).
Secrets/vars esperados: `SONAR_TOKEN`, `SONAR_HOST_URL`, `vars.SONAR_ORGANIZATION` (SonarQube Cloud), `EC2_SSH_KEY`, `EC2_USER`, `EC2_PUBLIC_HOST`, `EC2_PRIVATE_HOST`.
Os avisos da IDE sobre `env.IMAGE_PREFIX` no workflow são falsos positivos (a variável é definida em tempo de execução via `$GITHUB_ENV`).

## Git

- Remoto: `origin` = https://github.com/1GustavoBorgonha1/aplicacao_tb_fnl_si (branch `main`). O nome das imagens no GHCR é em minúsculas: `ghcr.io/1gustavoborgonha1/aplicacao_tb_fnl_si/{backend,frontend}`.
- Faça commit ou push **apenas quando o usuário pedir**. Mensagens em português.
- Antes de commitar, confirme que `.env`, `node_modules/`, `dist/` e `coverage/` estão fora (`git add -A --dry-run`).

## Pendências (estado em 2026-11-17)

### 1. Pipeline vermelho: falta configurar o SonarQube ⚠️
No primeiro push, os jobs **Testes e lint** e **Auditoria de dependências** passaram (59 testes no GitHub). O job **SonarQube** falhou em "Verificar configuração" porque os secrets não existem; por isso **build e deploy não rodaram**. É o gate funcionando, não um bug. Para resolver (o usuário precisa fazer; exige login no navegador):
1. Entrar em https://sonarcloud.io com a conta do GitHub → *Analyze new project* → importar `aplicacao_tb_fnl_si`.
2. No projeto: *Administration → Analysis Method* → **desligar "Automatic Analysis"** (senão conflita com a análise do CI).
3. *My Account → Security* → gerar um token.
4. No GitHub, em *Settings → Secrets and variables → Actions*:
   - Secret `SONAR_TOKEN` = token gerado
   - Secret `SONAR_HOST_URL` = `https://sonarcloud.io`
   - Variable `SONAR_ORGANIZATION` = chave da organização no SonarCloud (geralmente `1gustavoborgonha1`)
5. Conferir se a *Project Key* no SonarCloud é igual a `sonar.projectKey` em `sonar-project.properties` (hoje `marmifit`). O SonarCloud costuma sugerir `<org>_<repo>`; se for diferente, **ajuste o arquivo** para a key do SonarCloud.
6. *Actions → CI/CD → Re-run all jobs* e confirmar que o Quality Gate passa. Se reprovar, corrigir os achados (não afrouxar o gate).

### 2. PRs do Dependabot abertas (~10), não fazer merge em lote
Abertas logo após o primeiro push; quase todas são **major** e podem quebrar: eslint 10 e @eslint/js 10, globals 17, pino 10, pino-http 11, vite 8, @vitejs/plugin-react 6, node 26-alpine (Docker), sonarqube-scan-action v8, docker/build-push-action v7, e outras. Todas falham no CI pelo mesmo motivo do item 1. Depois de resolver o SonarQube, avaliar **uma por vez**: ler o changelog, rodar lint/testes/build e checar o `npm audit`. Sugestão: aceitar primeiro as de GitHub Actions; o Node no Docker deve ficar em versão LTS (manter 22 ou ir para 24, não 26 se não for LTS). Se uma PR for recusada, feche com comentário explicando o motivo.

### 3. Avisos do CI (não bloqueiam)
- `actions/checkout@v4`, `setup-node@v4` e `upload-artifact@v4` usam Node 20 (depreciado); resolver aceitando as PRs de Actions do Dependabot ou subindo as majors.
- `ubuntu-latest` vai migrar para Ubuntu 26; sem ação necessária por enquanto.

### 4. Deploy na AWS (ainda não feito)
Seguir `docs/deploy-aws.md` (VPC, SGs, RDS, S3 + CloudFront, IAM Role, 2 EC2s, ALB + WAF). Depois criar os secrets `EC2_SSH_KEY`, `EC2_USER`, `EC2_PUBLIC_HOST` e `EC2_PRIVATE_HOST`, a variable `DEPLOY_ENABLED=true` e o environment `production` com aprovação manual. A parte de AWS está documentada, mas **nunca foi testada**.

### 5. Itens menores
- Proteção da branch `main` no GitHub (exigir CI verde antes de merge): ainda não configurada.
- Trocar a senha do admin em produção (não há tela de troca de senha; hoje só recriando via seed ou SQL). Pode virar a spec `006`.
- O frontend não tem testes automatizados (a cobertura do SonarQube exclui `frontend/**`).
