# Plano 000 — Arquitetura

> Referência: [spec.md](spec.md)

## 1. Visão geral (ambiente local)

```
                 navegador
                    │  http://localhost:8080
        ┌───────────▼────────────┐   rede: front-net
        │ frontend (Nginx :8080) │   - serve o build React
        │  usuário não-root      │   - proxy /api e /uploads → backend
        └───────────┬────────────┘   - headers de segurança + rate limit
                    │
        ┌───────────▼────────────┐   redes: front-net + back-net
        │ backend (Node :3000)   │   - API REST Express
        │  usuário não-root      │   - JWT + RBAC
        └─────┬────────────┬─────┘
              │            │ volume uploads/ (STORAGE_DRIVER=local)
        ┌─────▼──────┐     │
        │ db Postgres│     │        rede: back-net (internal: true)
        │ sem porta  │     │        → banco inacessível do host/internet
        │ no host    │     │
        └────────────┘
```

## 2. Visão alvo (AWS — trabalho final)

Diagrama: [docs/arquitetura-aws.png](../../docs/arquitetura-aws.png). Infraestrutura provisionada com **Terraform** (ADR-12).

```
Internet ─► WAF ─► ALB (subnet pública) ─► Target Group HTTP :30080
                                               │
              subnet privada ─► cluster K3s: master + 3 workers (Launch Template)
                                pod frontend (Nginx) ─► Service backend:3000 ─► pod backend (Node)
                                               │ 5432
                                               └─► RDS PostgreSQL (criptografado, sem acesso público)
workers ─► NAT Gateway ─► Docker Hub (imagens) / S3 (upload das fotos) / SSM
usuários ─► S3 de imagens (leitura pública só em meals/*)
```
O Nginx continua fazendo proxy para `backend:3000`, que no cluster é o nome do Service do Kubernetes — mesma imagem em todos os ambientes.
Manifests em [k8s/](../../k8s/), contrato com a infraestrutura em [infra/README.md](../../infra/README.md) e runbook em [docs/deploy-aws.md](../../docs/deploy-aws.md).

## 3. Stack
| Camada | Tecnologia | Motivo |
|---|---|---|
| Frontend | React 19 + Vite + React Router | SPA simples, build estático |
| Servidor web | `nginxinc/nginx-unprivileged` | Roda sem root, proxy reverso, headers |
| Backend | Node 26 LTS + Express 5 | Pedido da disciplina, erros async nativos |
| Validação | zod | Schema único por rota |
| Banco | PostgreSQL 16 (→ RDS) | Relacional, transações nos pedidos |
| Senhas | bcryptjs (custo 12) | Hash lento e com salt, sem binário nativo |
| Token | jsonwebtoken (HS256, 2h) | Stateless, simples |
| Upload | multer (memória) + verificação de *magic bytes* | Não confia no MIME do cliente |
| Imagens | Pasta local (→ S3 via `@aws-sdk/client-s3`) | `STORAGE_DRIVER=local|s3` |
| Logs | pino / pino-http | JSON estruturado, redação de segredos |
| Testes | vitest + supertest + Postgres real | Testes de integração da API |
| Qualidade/segurança | SonarQube + npm audit + Dependabot | Scanner no pipeline (Aula 7) |
| CI/CD | GitHub Actions | Pipeline com gates |
| Registro de imagens | Docker Hub | Pull pelos workers via NAT (ADR-14) |
| Orquestração | K3s (Kubernetes leve) + Kustomize | Cluster de 4 nós barato (ADR-13) |
| Infraestrutura | Terraform | IaC = base do plano de DR (ADR-12) |

## 4. Modelo de dados

```
users (id, nome, email UNIQUE, senha_hash, role[admin|restaurante|cliente], ativo, token_versao, criado_em)
  │1
  │1
restaurants (id, user_id UNIQUE→users, nome, cnpj UNIQUE, telefone, endereco, horario,
             status[pendente|aprovado|bloqueado], criado_em)
  │1
  │N
meals (id, restaurant_id→restaurants, nome, descricao, preco_centavos, kcal, proteina_g,
       categoria[tradicional|low_carb|vegana|vegetariana|sem_gluten], imagem_key, disponivel, criado_em)

orders (id, cliente_id→users, restaurant_id→restaurants,
        status[recebido|em_preparo|pronto_retirada|retirado|cancelado],
        retirada_em, observacao, total_centavos, criado_em, atualizado_em)
  │1
  │N
order_items (id, order_id→orders, meal_id→meals ON DELETE SET NULL, nome_marmita,
             qtd, preco_unit_centavos)
```
Valores monetários sempre em **centavos (inteiro)**, sem ponto flutuante.

## 5. Convenções da API
- Prefixo `/api`, JSON, autenticação `Authorization: Bearer <jwt>`.
- Erros: `{ "erro": "mensagem" }` (+ `detalhes` só em erros de validação).
- Códigos: 400 validação · 401 sem/token inválido · 403 sem permissão · 404 não encontrado (também usado para recurso de outro dono, para não revelar existência) · 409 conflito · 429 rate limit.

## 6. ADRs (registro de decisões)
- **ADR-01 — Monorepo com 2 serviços.** Simplicidade (constituição III). Front e back têm Dockerfile próprios, permitindo escalar separadamente.
- **ADR-02 — Mesma origem via Nginx.** O Nginx faz proxy de `/api`; evita CORS e reduz superfície de ataque.
- **ADR-03 — Autorização por dono no servidor.** O `restaurant_id` vem sempre do usuário autenticado, nunca do body (previne IDOR).
- **ADR-04 — Usuário revalidado a cada requisição.** O middleware de auth consulta `users.ativo`; desativar um usuário corta o acesso na hora, mesmo com JWT válido.
- **ADR-05 — Storage plugável.** Interface `save/remove/url`; driver `local` agora e `s3` na AWS.
- **ADR-06 — SonarQube em vez de Trivy.** Decisão do grupo: SAST + qualidade + cobertura com Quality Gate bloqueante. Dependências cobertas por `npm audit` + Dependabot.
- ~~**ADR-07 — Sem IaC.**~~ **Substituído pelo ADR-12.** A infraestrutura AWS será provisionada manualmente seguindo `docs/deploy-aws.md`.
- **ADR-08 — Migrations SQL próprias.** Um runner de ~30 linhas executa `migrations/*.sql` em ordem no startup; dispensa ORM.
- ~~**ADR-09 — Frontend e backend em EC2s separadas na AWS.**~~ **Substituído pelo ADR-13.** Atende a Aula 12 (máquina pública expõe, privada hospeda serviços); o backend nunca recebe tráfego direto da internet.
- **ADR-10 — zod 4.** O `npm audit` do pipeline barrou o zod 3 (GHSA-mrhx-c7xc-m3w5, severidade alta); migrado para zod 4 (`z.flattenError`).
- **ADR-11 — Revogação de sessão por versão de token.** O JWT continua *stateless*, mas carrega a claim `tv`, comparada com `users.token_versao` no `requireAuth` (que já consulta o banco — ADR-04). Trocar a senha incrementa a versão e derruba todas as sessões anteriores sem precisar de *blacklist* de tokens (spec 006).
- **ADR-12 — Terraform como IaC e base do DR.** Requisito do trabalho final: toda a infraestrutura (VPC, subnets, NAT, SGs, ALB + WAF, EC2 do K3s, RDS, S3) é descrita em `infra/terraform/`, versionada e revisada por PR. O state fica num bucket S3 privado, versionado e com lock. Recuperar o ambiente = `terraform apply` + restore do snapshot do RDS ([PCN/DR](../../docs/continuidade/pcn-pri-dr.md)).
- **ADR-13 — K3s em vez de EC2 com docker compose.** Cluster com 1 master e 3 workers (Launch Template + Auto Scaling Group) na subnet privada. O ALB encaminha para o NodePort **30080** do frontend; o backend fica só como Service ClusterIP. Ganhos: rollout sem indisponibilidade, autorrecuperação de pods, NetworkPolicy (segmentação dentro do cluster) e Pod Security `restricted`. Manifests com Kustomize (embutido no `kubectl`, sem dependência nova).
- **ADR-14 — Docker Hub como registro de imagens.** Segue o diagrama da parte 1; repositórios públicos dispensam credencial de pull nos workers. A pipeline publica as imagens com a tag do commit (SHA), o que torna cada deploy rastreável e reversível (`kubectl rollout undo`).
- **ADR-15 — Deploy via AWS SSM + GitHub OIDC.** O master não tem IP público, então a pipeline executa `kubectl set image` no master por **SSM Run Command**, assumindo uma IAM Role via **OIDC** (credencial temporária, restrita a este repositório e à instância do master). Sem chave SSH, sem access key guardada no GitHub e sem porta administrativa aberta.
- **ADR-16 — Testes do frontend com Vitest + Testing Library (jsdom).** Mesmo runner do backend (Vitest) e integrado ao Vite 8; os testes exercitam o componente como o usuário (rótulos, papéis ARIA), com `fetch` simulado. Ficam em `frontend/tests/`, rodam no CI e a cobertura (`lcov`) vai para o SonarQube junto com a do backend. Dependências só de desenvolvimento: `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.
