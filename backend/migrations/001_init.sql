-- Spec 000 §4 — Modelo de dados inicial da MarmiFit.
-- CHECK constraints são uma segunda camada de validação (defesa em profundidade).

CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  nome        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,
  senha_hash  VARCHAR(100) NOT NULL,
  role        VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'restaurante', 'cliente')),
  ativo       BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE restaurants (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER      NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  nome        VARCHAR(100) NOT NULL,
  cnpj        CHAR(14)     NOT NULL UNIQUE,
  telefone    VARCHAR(11)  NOT NULL,
  endereco    VARCHAR(200) NOT NULL,
  horario     VARCHAR(100) NOT NULL DEFAULT '',
  status      VARCHAR(20)  NOT NULL DEFAULT 'pendente'
              CHECK (status IN ('pendente', 'aprovado', 'bloqueado')),
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE meals (
  id              SERIAL PRIMARY KEY,
  restaurant_id   INTEGER      NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  nome            VARCHAR(100) NOT NULL,
  descricao       VARCHAR(500) NOT NULL DEFAULT '',
  preco_centavos  INTEGER      NOT NULL CHECK (preco_centavos > 0 AND preco_centavos <= 100000),
  kcal            INTEGER      CHECK (kcal BETWEEN 0 AND 5000),
  proteina_g      INTEGER      CHECK (proteina_g BETWEEN 0 AND 500),
  categoria       VARCHAR(20)  NOT NULL
                  CHECK (categoria IN ('tradicional', 'low_carb', 'vegana', 'vegetariana', 'sem_gluten')),
  imagem_key      VARCHAR(200),
  disponivel      BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_meals_restaurant ON meals(restaurant_id);

CREATE TABLE orders (
  id              SERIAL PRIMARY KEY,
  cliente_id      INTEGER      NOT NULL REFERENCES users(id),
  restaurant_id   INTEGER      NOT NULL REFERENCES restaurants(id),
  status          VARCHAR(20)  NOT NULL DEFAULT 'recebido'
                  CHECK (status IN ('recebido', 'em_preparo', 'pronto_retirada', 'retirado', 'cancelado')),
  retirada_em     TIMESTAMPTZ  NOT NULL,
  observacao      VARCHAR(300) NOT NULL DEFAULT '',
  total_centavos  INTEGER      NOT NULL CHECK (total_centavos > 0),
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_cliente ON orders(cliente_id);
CREATE INDEX idx_orders_restaurant ON orders(restaurant_id);

CREATE TABLE order_items (
  id                   SERIAL PRIMARY KEY,
  order_id             INTEGER      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  meal_id              INTEGER      REFERENCES meals(id) ON DELETE SET NULL,
  nome_marmita         VARCHAR(100) NOT NULL,
  qtd                  INTEGER      NOT NULL CHECK (qtd BETWEEN 1 AND 20),
  preco_unit_centavos  INTEGER      NOT NULL CHECK (preco_unit_centavos > 0)
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
