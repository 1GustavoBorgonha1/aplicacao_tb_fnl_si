# Tarefas 006 — Troca de senha

> Referência: [spec.md](spec.md) · [plan.md](plan.md)

- [x] T01 — Migration `002_token_versao.sql`
- [x] T02 — `signToken` com claim `tv`; `requireAuth` compara com `users.token_versao`
- [x] T03 — Rota `PATCH /api/auth/senha` com zod, bcrypt, rate limit por usuário e auditoria
- [x] T04 — Testes CA-006-01 a CA-006-07 (`backend/tests/senha.test.js`)
- [x] T05 — Página **Minha conta** (`/conta`) + item no menu de todos os perfis
- [x] T06 — Atualizar spec 000 (funcionalidades, modelo de dados, ADR-11), README (API), OWASP e matriz de riscos
