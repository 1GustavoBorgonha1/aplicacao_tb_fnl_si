# Banco de dados — o que o Terraform precisa provisionar

Arquivo do schema: [schema.sql](schema.sql) (PostgreSQL 16).

## Resumo
- **Motor:** Amazon RDS for **PostgreSQL 16**, porta **5432**. (No diagrama, trocar "RDS MySQL / 3306" por "RDS PostgreSQL / 5432".)
- **As tabelas são criadas pela própria aplicação** no startup (migrations versionadas em `backend/migrations/`). O Terraform só precisa criar a instância, o banco e o usuário. Rodar o `schema.sql` à mão é opcional; se rodar, a aplicação reconhece e não recria nada.
- O admin inicial também é criado pela aplicação (variáveis `ADMIN_EMAIL` / `ADMIN_PASSWORD` no Secret do Kubernetes).

## Configuração recomendada do RDS
| Item | Valor | Por quê |
|---|---|---|
| `engine` / `engine_version` | `postgres` / `16` | Versão usada nos testes |
| `instance_class` | `db.t4g.micro` (ou `db.t3.micro`) | Barato, suficiente para a demo |
| `db_name` | `marmifit` | Nome esperado pela aplicação |
| `port` | `5432` | |
| `db_subnet_group` | subnets **privadas** | Segmentação de rede |
| `publicly_accessible` | `false` | Banco nunca exposto à internet |
| Security Group | entrada 5432 **só do SG dos workers** (e do master, se for rodar `psql`) | Mínimo privilégio |
| `storage_encrypted` | `true` | Criptografia em repouso (AES-256) |
| Parameter group | `rds.force_ssl = 1` | TLS obrigatório (a app usa `DATABASE_SSL=true`) |
| `backup_retention_period` | `7` | Plano de DR |
| `deletion_protection` | `true` (desligar só para o `destroy` final) | Evita apagar o banco por engano |
| `skip_final_snapshot` | `false` | Snapshot final para restaurar (DR) |
| `manage_master_user_password` | `true` (Secrets Manager) | Senha fora do código e do state |

## Conexão usada pela aplicação
O backend recebe uma única variável (no Secret do Kubernetes, **nunca** no Git):
```
DATABASE_URL=postgres://<usuario>:<senha>@<endpoint-do-rds>:5432/marmifit
DATABASE_SSL=true
```
Recomendado: um usuário próprio da aplicação (dono do banco `marmifit`), separado do usuário master do RDS.

## Modelo de dados
```
users (id, nome, email UNIQUE, senha_hash, role[admin|restaurante|cliente], ativo, token_versao, criado_em)
  │1
  │1
restaurants (id, user_id UNIQUE→users, nome, cnpj UNIQUE, telefone, endereco, horario,
             status[pendente|aprovado|bloqueado], criado_em)
  │1
  │N
meals (id, restaurant_id→restaurants, nome, descricao, preco_centavos, kcal, proteina_g,
       categoria[tradicional|low_carb|vegana|vegetariana|sem_gluten], imagem_key, disponivel, criado_em)

orders (id, cliente_id→users, restaurant_id→restaurants,
        status[recebido|em_preparo|pronto_retirada|retirado|cancelado],
        retirada_em, observacao, total_centavos, criado_em, atualizado_em)
  │1
  │N
order_items (id, order_id→orders, meal_id→meals ON DELETE SET NULL, nome_marmita,
             qtd, preco_unit_centavos)
```
Valores monetários em **centavos (inteiro)**. As imagens das marmitas **não** ficam no banco: `meals.imagem_key` guarda só a chave do objeto no bucket S3 de imagens.
