-- =============================================================================
-- MarmiFit — schema do banco (PostgreSQL 16 / Amazon RDS for PostgreSQL)
-- =============================================================================
-- Consolida backend/migrations/001_init.sql + 002_token_versao.sql.
--
-- IMPORTANTE: rodar este arquivo é OPCIONAL. O backend aplica as migrations
-- sozinho no startup (backend/src/db/migrate.js, com advisory lock — seguro com
-- várias réplicas no K3s). Este script existe para documentação, revisão e para
-- quem quiser criar o schema manualmente. Ele é idempotente e registra as
-- migrations em schema_migrations, então o backend não tenta recriá-las.
--
-- Uso (de dentro da VPC, ex.: a partir do master do K3s):
--   psql "host=<endpoint-rds> port=5432 dbname=marmifit user=marmifit_app sslmode=require" -f schema.sql
-- =============================================================================

BEGIN;

-- Controle de migrations usado pelo backend.
CREATE TABLE IF NOT EXISTS schema_migrations (
  nome        TEXT PRIMARY KEY,
  aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Usuários de todos os perfis. Senha só como hash bcrypt (nunca em texto).
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  nome         VARCHAR(100) NOT NULL,
  email        VARCHAR(150) NOT NULL UNIQUE,
  senha_hash   VARCHAR(100) NOT NULL,
  role         VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'restaurante', 'cliente')),
  ativo        BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Spec 006: incrementada na troca de senha → invalida os JWT antigos.
  token_versao INTEGER      NOT NULL DEFAULT 0 CHECK (token_versao >= 0)
);

-- Empresa (1:1 com o usuário de perfil restaurante).
CREATE TABLE IF NOT EXISTS restaurants (
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

-- Marmitas. Preço em centavos (inteiro). imagem_key = chave do objeto no S3.
CREATE TABLE IF NOT EXISTS meals (
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
CREATE INDEX IF NOT EXISTS idx_meals_restaurant ON meals(restaurant_id);

-- Pedidos para retirada (sem entrega, pagamento no local).
CREATE TABLE IF NOT EXISTS orders (
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
CREATE INDEX IF NOT EXISTS idx_orders_cliente ON orders(cliente_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);

-- Itens do pedido. Nome e preço copiados no momento da compra (histórico imutável).
CREATE TABLE IF NOT EXISTS order_items (
  id                   SERIAL PRIMARY KEY,
  order_id             INTEGER      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  meal_id              INTEGER      REFERENCES meals(id) ON DELETE SET NULL,
  nome_marmita         VARCHAR(100) NOT NULL,
  qtd                  INTEGER      NOT NULL CHECK (qtd BETWEEN 1 AND 20),
  preco_unit_centavos  INTEGER      NOT NULL CHECK (preco_unit_centavos > 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Marca as migrations como aplicadas para o backend não reaplicá-las.
INSERT INTO schema_migrations (nome) VALUES ('001_init.sql'), ('002_token_versao.sql')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

-- O admin NÃO é criado aqui: o backend cria no primeiro start a partir de
-- ADMIN_EMAIL / ADMIN_PASSWORD (Secret do Kubernetes), com hash bcrypt.
