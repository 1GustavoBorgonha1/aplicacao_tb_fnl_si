# Plano 001 — Autenticação

> Referência: [spec.md](spec.md)

## Endpoints
| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| POST | `/api/auth/register/cliente` | visitante | Cria cliente |
| POST | `/api/auth/register/restaurante` | visitante | Cria usuário restaurante + restaurante (transação) |
| POST | `/api/auth/login` | visitante | Retorna `{ token, user }` |
| GET | `/api/auth/me` | autenticado | Dados do usuário logado (+ restaurante se houver) |

## Validação (zod)
- `nome`: string 2–100 · `email`: e-mail ≤ 150, normalizado · `senha`: 8–72, ≥ 1 letra e ≥ 1 número (72 = limite do bcrypt).
- `restaurante`: `nome` 2–100, `cnpj` 14 dígitos (máscara removida), `telefone` 10–11 dígitos, `endereco` 5–200, `horario` ≤ 100.

## Middlewares
- `requireAuth` — valida JWT, busca usuário no banco, rejeita se `ativo=false` (ADR-04), popula `req.user`.
- `requireRole(...roles)` — 403 se `req.user.role` não estiver na lista.
- `loginLimiter` / `registerLimiter` — `express-rate-limit`, configurável por env (`LOGIN_RATE_LIMIT`).

## Arquivos
- `backend/src/routes/auth.js`, `backend/src/middlewares/auth.js`, `backend/src/services/password.js`, `backend/src/services/token.js`
- `backend/tests/auth.test.js`
- Frontend: `pages/Home.jsx`, `pages/Login.jsx`, `pages/CadastroCliente.jsx`, `pages/CadastroEmpresa.jsx`, `auth.jsx` (contexto + rotas protegidas)

## Dependências novas
`bcryptjs`, `jsonwebtoken`, `express-rate-limit`, `zod`.
