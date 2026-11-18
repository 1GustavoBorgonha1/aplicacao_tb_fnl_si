O schema utilizado esta em `../schema.sql`, na raiz. O padrao e `db_schema_file = "schema.sql"`.

Origem: `infra/database/schema.sql` do commit `10a771b00532caff63ee1d94218bafaea9636f3b` da aplicacao MarmiFit. Inclui migrations 001, 002 e 003 (horarios de retirada).

O arquivo usa PostgreSQL 16 e BEGIN/COMMIT. A importacao usa psql com ON_ERROR_STOP e TLS. Somente apos sucesso registra conclusao em public._terraform_bootstrap. Com caminho vazio, o backend aplica suas migrations no startup.

Editar o SQL apos a conclusao inicial nao reimporta o arquivo nem altera tabelas existentes. As migrations pendentes sao responsabilidade da imagem do backend. Nunca marque uma migration como aplicada sem executar suas alteracoes.
