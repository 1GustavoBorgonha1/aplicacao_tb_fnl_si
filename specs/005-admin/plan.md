# Plano 005 — Admin

> Referência: [spec.md](spec.md)

## Endpoints (todos `requireRole('admin')`)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/admin/stats` | Totais por perfil, empresas por status, pedidos por status |
| GET | `/api/admin/restaurants?status=` | Empresas com dados do dono |
| PATCH | `/api/admin/restaurants/:id/status` | `{ status: pendente|aprovado|bloqueado }` |
| GET | `/api/admin/users?role=` | Usuários (sem `senha_hash`) |
| PATCH | `/api/admin/users/:id/ativo` | `{ ativo: boolean }` (não pode ser o próprio admin) |
| GET | `/api/admin/orders?status=` | Todos os pedidos |
| GET | `/api/admin/meals` | Todas as marmitas com o restaurante |
| PATCH | `/api/admin/meals/:id` | `{ disponivel: boolean }` |

## Arquivos
- `backend/src/routes/admin.js`, `backend/tests/admin.test.js`
- Frontend: `pages/admin/Painel.jsx` (abas: Resumo, Empresas, Usuários, Pedidos, Marmitas)

## Dependências novas
Nenhuma.
