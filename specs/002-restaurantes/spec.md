# Spec 002 — Restaurantes (Empresas)

- **Status:** implementada
- **Perfis:** restaurante, cliente, visitante

## 1. Contexto
A empresa se cadastra (spec 001) e fica **pendente** até o admin aprovar (spec 005). Só restaurantes **aprovados** aparecem para os clientes.

## 2. Histórias de usuário
- **HU-002-01** — Como restaurante, quero ver e editar os dados da minha empresa (nome, telefone, endereço de retirada, horário).
- **HU-002-02** — Como restaurante, quero ver o status da minha empresa (pendente/aprovado/bloqueado).
- **HU-002-03** — Como cliente, quero ver a lista de restaurantes disponíveis, para escolher onde pedir.

## 3. Critérios de aceite
- **CA-002-01** — `GET /api/restaurants` lista **apenas** restaurantes `aprovado`.
- **CA-002-02** — `GET /api/restaurants/:id` de restaurante pendente ou bloqueado retorna **404**.
- **CA-002-03** — O restaurante edita apenas a própria empresa (`/api/restaurants/me`); o CNPJ e o status não podem ser alterados por ele.
- **CA-002-04** — Restaurante **bloqueado** recebe **403** nas rotas de gestão (empresa, marmitas, pedidos).
- **CA-002-05** — A listagem pública não expõe CNPJ nem e-mail do dono.

## 4. Requisitos de segurança
- **RS-002-01** — O restaurante é identificado pelo usuário do token (ADR-03), nunca por parâmetro.
- **RS-002-02** — Campos de texto validados e com tamanho máximo (XSS armazenado é neutralizado pelo React, que escapa a saída).

## 5. Fora de escopo
Geolocalização, avaliações de restaurante.
