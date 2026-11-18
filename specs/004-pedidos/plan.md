# Plano 004 — Pedidos

> Referência: [spec.md](spec.md)

## Endpoints
| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| POST | `/api/orders` | cliente | `{ restaurant_id, retirada_em, observacao?, itens: [{ meal_id, qtd }] }` |
| GET | `/api/orders/mine` | cliente | Pedidos do cliente com itens |
| PATCH | `/api/orders/:id/cancel` | cliente (dono) | Cancela se `recebido` |
| GET | `/api/orders/received` | restaurante | Pedidos da empresa (`?status=`) |
| PATCH | `/api/orders/:id/status` | restaurante (dono) | `{ status }` seguindo a máquina de estados |

## Máquina de estados (restaurante)
```js
const TRANSICOES = {
  recebido:        ['em_preparo', 'cancelado'],
  em_preparo:      ['pronto_retirada', 'cancelado'],
  pronto_retirada: ['retirado'],
};
```

## Transação de criação
`BEGIN` → `SELECT meals ... WHERE id = ANY($ids) AND restaurant_id = $r AND disponivel` + restaurante aprovado → confere se todos foram encontrados → calcula total → `INSERT orders` → `INSERT order_items` (com `nome_marmita` e `preco_unit_centavos`) → `COMMIT`.

## Janela de retirada (CA-004-10)
Antes da transação, lê `dias_retirada, abre_as, fecha_as` do restaurante e chama `dentroDoHorario(retirada_em, restaurante)` (`backend/src/horario.js`). A conversão para o fuso `America/Sao_Paulo` usa `Intl.DateTimeFormat` (ICU do Node, sem dependência nova) — o servidor roda em UTC. No Catálogo, o horário aparece ao lado do campo e o `datetime-local` tem `min`; a validação que vale é a do backend.

## Arquivos
- `backend/src/routes/orders.js`, `backend/tests/orders.test.js`
- Frontend: `pages/cliente/Catalogo.jsx` (carrinho), `pages/cliente/MeusPedidos.jsx`, `pages/restaurante/PedidosRecebidos.jsx`

## Dependências novas
Nenhuma.
