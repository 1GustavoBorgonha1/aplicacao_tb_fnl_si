# Plano 006 — Troca de senha

> Referência: [spec.md](spec.md)

## Endpoints
| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| PATCH | `/api/auth/senha` | autenticado (qualquer perfil) | Body `{ senha_atual, nova_senha }` → `200 { token }`. Erros: 400 (validação / senha atual incorreta / senha igual), 401 (sem token), 429 (rate limit) |

Ordem dos middlewares: `requireAuth` → `senhaLimiter` → handler (o limiter precisa de `req.user` para limitar por usuário).

## Modelo de dados
- Migration `002_token_versao.sql`: `ALTER TABLE users ADD COLUMN token_versao INTEGER NOT NULL DEFAULT 0`.
- Troca de senha: `UPDATE users SET senha_hash = $1, token_versao = token_versao + 1 WHERE id = $2 RETURNING *` (uma única instrução — atômica).

## Token (RS-006-03)
- `signToken(user)` passa a incluir `tv: user.token_versao`.
- `requireAuth` lê `token_versao` junto com o usuário e rejeita com **401** se `(payload.tv ?? 0) !== user.token_versao`.
- Tokens emitidos antes desta mudança não têm `tv` → tratados como versão 0, que é o valor inicial da coluna: ninguém é deslogado pelo deploy.

## Validação (zod)
- `senha_atual`: string 1–200 (mesmo formato aceito pelo login; a política não se aplica à senha antiga).
- `nova_senha`: mesma regra do cadastro (`senha` exportada de `routes/auth.js`: 8–72, letra e número).
- Igualdade `senha_atual === nova_senha` → 400 com `detalhes.nova_senha`.

## Rate limit (RS-006-04)
`express-rate-limit` (já é dependência) com `limit = LOGIN_RATE_LIMIT`, `windowMs = LOGIN_RATE_WINDOW_MIN`, `keyGenerator = user:<id>` e `skipSuccessfulRequests: true` (só tentativas que falham contam).

## Frontend
- Página `pages/MinhaConta.jsx` em `/conta`, protegida para qualquer perfil (`<Protected>` sem `role`).
- Campos: senha atual, nova senha, confirmar nova senha (a confirmação é validada só no cliente — UX).
- Sucesso: grava o novo token (`tokenStore.set`), limpa o formulário e mostra mensagem.
- Item **"Minha conta"** no menu de todos os perfis (`Layout.jsx`).

## Arquivos
- `backend/migrations/002_token_versao.sql`
- `backend/src/routes/auth.js`, `backend/src/middlewares/auth.js`, `backend/src/services/token.js`
- `backend/tests/senha.test.js`, `backend/tests/helpers.js` (sem mudança de API)
- `frontend/src/pages/MinhaConta.jsx`, `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`

## Dependências novas
Nenhuma.
