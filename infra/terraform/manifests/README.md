# Manifests oficiais da AWS

Os quatro YAML desta pasta são a fonte oficial dos manifests usados pelo Terraform na AWS. Eles tiveram origem em [k8s/base no commit 10a771b](https://github.com/1GustavoBorgonha1/aplicacao_tb_fnl_si/tree/10a771b00532caff63ee1d94218bafaea9636f3b/k8s/base), mas são mantidos aqui para o ambiente AWS. Não são mais cópias sem alterações.

O Terraform lê esses arquivos locais e define namespace, imagens, réplicas, seletor dos workers e anotações de configuração. A política `imagePullPolicy: Always` está declarada nos Deployments desta pasta e é preservada pelo deploy renderizado. O padrão das imagens é `latest`; registro e tag são definidos pelas variáveis Terraform. Não há download de manifests da branch `main` durante o deploy.

O ConfigMap e o Secret são gerados pelo IaC. O Secret contém `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` e é criado no master via SSM. O frontend não recebe esse Secret.

Não aplique esses YAML diretamente: as imagens base são nomes genéricos e faltam as configurações geradas. Use o procedimento de `terraform plan/apply` do [README principal](../README.md). Para atualizar o conteúdo de `latest`, siga o procedimento de rollout descrito lá.

`k8s/base` permanece como base dos ambientes locais. Não há sincronização automática entre as duas pastas. Ao mudar `securityContext`, NetworkPolicy ou limites de recursos aqui, avise o responsável pela aplicação e descreva a mudança para que ela seja avaliada e refletida em `k8s/base`. A E5 adicionou apenas a política de download `Always`; a E6 altera somente documentação.
