# Schema oficial da AWS

O arquivo oficial para inicialização do banco na AWS é [infra/terraform/schema.sql](../schema.sql). Esta pasta contém apenas esta documentação. O padrão é `db_schema_file = "schema.sql"`, com caminho relativo à raiz do Terraform, não à pasta `sql`.

O schema foi originalmente trazido de `infra/database/schema.sql` do commit `10a771b00532caff63ee1d94218bafaea9636f3b`. Esse caminho é apenas uma referência histórica: `infra/database` e `k8s/overlays/aws` já foram removidos do projeto. Não recrie cópias nesses locais.

O SQL consolida as migrations `001_init.sql`, `002_token_versao.sql` e `003_horario_retirada.sql` de `backend/migrations`. Inclui a versão do token para troca de senha e os campos e restrições de horário de retirada. Registra essas migrations em `schema_migrations`, usada pelo backend, e não cria o usuário administrador: essa criação cabe ao backend com as configurações do Secret.

O arquivo usa PostgreSQL 16 e `BEGIN/COMMIT`. A importação inicial pelo master usa `psql` com `ON_ERROR_STOP` e TLS. Somente após sucesso registra a conclusão em `public._terraform_bootstrap`. Esse marcador controla o bootstrap do Terraform; `schema_migrations` controla as migrations da aplicação. Com `db_schema_file = ""`, o Terraform pula a importação e o backend aplica suas migrations no startup.

Editar o SQL após a conclusão inicial não reimporta o arquivo nem altera tabelas existentes. As migrations pendentes são responsabilidade da imagem do backend. Ao adicionar uma migration à aplicação, revise também o schema consolidado para bancos novos, sem marcar uma migration como aplicada antes de executar suas alterações. O schema não substitui um backup nem restaura dados anteriores; consulte o [procedimento de recuperação](../README.md#recuperar-dados).
