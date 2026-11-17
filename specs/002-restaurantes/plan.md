# Plano 002 — Restaurantes

> Referência: [spec.md](spec.md)

## Endpoints
| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| GET | `/api/restaurants` | público | Lista aprovados (`id, nome, telefone, endereco, horario`) |
| GET | `/api/restaurants/:id` | público | Detalhe de um aprovado |
| GET | `/api/restaurants/me` | restaurante | Dados completos da própria empresa |
| PUT | `/api/restaurants/me` | restaurante (não bloqueado) | Atualiza `nome, telefone, endereco, horario` |

## Middleware
- `loadRestaurant` — busca o restaurante do `req.user`; 403 se bloqueado (exceto `GET /me`, para ele ver o status).

## Arquivos
- `backend/src/routes/restaurants.js`, `backend/src/middlewares/restaurant.js`, `backend/tests/restaurants.test.js`
- Frontend: `pages/cliente/Restaurantes.jsx`, `pages/restaurante/MinhaEmpresa.jsx`

## Dependências novas
Nenhuma.
