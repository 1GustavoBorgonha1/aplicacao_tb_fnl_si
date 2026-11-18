# Plano 002 — Restaurantes

> Referência: [spec.md](spec.md)

## Endpoints
| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| GET | `/api/restaurants` | público | Lista aprovados (`id, nome, telefone, endereco, horario, dias_retirada, abre_as, fecha_as`) |
| GET | `/api/restaurants/:id` | público | Detalhe de um aprovado |
| GET | `/api/restaurants/me` | restaurante | Dados completos da própria empresa |
| PUT | `/api/restaurants/me` | restaurante (não bloqueado) | Atualiza `nome, telefone, endereco, dias_retirada, abre_as, fecha_as` (o `horario` é gerado) |

## Horário de retirada estruturado (CA-002-06/07)
- Migration `003_horario_retirada.sql`: `dias_retirada SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}'`, `abre_as TIME`, `fecha_as TIME`, com `CHECK` (dias em 0–6, 1 a 7 dias; abertura e fechamento juntos e `abre_as < fecha_as`). A coluna `horario` continua (texto de exibição, legado), agora **gerada no servidor** por `formatarHorario()` (`backend/src/horario.js`).
- zod: `dias_retirada` array de inteiros 0–6 únicos (padrão seg–sex); `abre_as`/`fecha_as` `HH:MM` ou vazio/nulo; refinamento: os dois juntos e abertura < fechamento.
- Respostas trazem `abre_as`/`fecha_as` como `HH:MM` (o Postgres devolve `HH:MM:SS`).
- Frontend: componente `HorarioRetirada.jsx` (checkboxes Dom–Sáb + `<input type="time">`) usado no Cadastro de empresa e em Minha empresa.

## Middleware
- `loadRestaurant` — busca o restaurante do `req.user`; 403 se bloqueado (exceto `GET /me`, para ele ver o status).

## Arquivos
- `backend/src/routes/restaurants.js`, `backend/src/middlewares/restaurant.js`, `backend/tests/restaurants.test.js`
- Frontend: `pages/cliente/Restaurantes.jsx`, `pages/restaurante/MinhaEmpresa.jsx`

## Dependências novas
Nenhuma.
