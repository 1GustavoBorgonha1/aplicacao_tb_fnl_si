# Manifests de origem

Fonte: https://github.com/1GustavoBorgonha1/aplicacao_tb_fnl_si/tree/10a771b00532caff63ee1d94218bafaea9636f3b/k8s/base

Os quatro YAML foram copiados sem alteracoes desse commit. O Terraform le os documentos e aplica namespace, imagens, replicas, seletor dos workers e anotacoes de configuracao. Nao ha download da branch main durante o deploy.

O ConfigMap e o Secret sao gerados pelo IaC. O Secret contem DATABASE_URL, JWT_SECRET, ADMIN_EMAIL e ADMIN_PASSWORD e e criado no master via SSM. O frontend nao recebe esse Secret.

Nao aplique esses YAML diretamente: as imagens base sao nomes genericos e faltam as configuracoes geradas. Use terraform plan/apply conforme o README principal.
