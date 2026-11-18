# Spec 004 — Pedidos para Retirada

- **Status:** implementada
- **Perfis:** cliente, restaurante

## 1. Contexto
O cliente escolhe um restaurante, monta o pedido a partir do catálogo e informa o horário em que vai **retirar**. O pagamento é feito **no local**: o sistema não processa nem guarda dados de pagamento.

## 2. Histórias de usuário
- **HU-004-01** — Como cliente, quero montar um pedido com várias marmitas e quantidades, escolher o horário de retirada e deixar uma observação.
- **HU-004-02** — Como cliente, quero acompanhar o status dos meus pedidos e cancelar um pedido que ainda não começou a ser preparado.
- **HU-004-03** — Como restaurante, quero ver os pedidos recebidos e atualizar o status até a retirada.

## 3. Ciclo de vida
```
recebido ──► em_preparo ──► pronto_retirada ──► retirado
   │              │
   └──────────────┴──► cancelado
```
- O **cliente** pode cancelar apenas em `recebido`.
- O **restaurante** avança o status na ordem acima e pode cancelar em `recebido` ou `em_preparo`.

## 4. Critérios de aceite
- **CA-004-01** — Pedido válido retorna **201** com o total **calculado no servidor** a partir dos preços do banco (o preço enviado pelo cliente é ignorado).
- **CA-004-02** — Todas as marmitas do pedido devem ser do mesmo restaurante, aprovado e disponíveis; caso contrário **400**.
- **CA-004-03** — Quantidade de 1 a 20 por item, de 1 a 20 itens por pedido.
- **CA-004-04** — Horário de retirada deve estar entre 30 minutos e 7 dias no futuro.
- **CA-004-05** — Cliente lista apenas os próprios pedidos; pedido de outro cliente → **404**.
- **CA-004-06** — Restaurante lista e altera apenas os pedidos da própria empresa; de outra → **404**.
- **CA-004-07** — Transição de status inválida (ex.: `recebido → retirado`) → **409**.
- **CA-004-08** — Cliente cancela em `recebido` → **200**; em outro status → **409**.
- **CA-004-09** — O pedido e seus itens são gravados em uma única transação.
- **CA-004-10** — Se o restaurante tem horário de retirada configurado (spec 002, CA-002-06), `retirada_em` precisa cair em um dos `dias_retirada` e entre `abre_as` e `fecha_as` (inclusive), no fuso **America/Sao_Paulo**; caso contrário **400** com o horário do restaurante na mensagem. Sem horário configurado vale apenas o CA-004-04.

## 5. Requisitos de segurança
- **RS-004-01** — Total recalculado no servidor (manipulação de preço / *parameter tampering*).
- **RS-004-02** — Verificação de dono em todas as consultas (`WHERE cliente_id = $user` / `restaurant_id = $rest`) — Broken Access Control/IDOR.
- **RS-004-03** — Mudanças de status registradas em log de auditoria (não repúdio).

## 6. Fora de escopo
Entrega, pagamento online, assinatura recorrente, notificações por e-mail/SMS.
