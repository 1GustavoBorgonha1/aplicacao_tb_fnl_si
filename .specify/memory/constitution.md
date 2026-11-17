# Constituição do Projeto MarmiFit

> Princípios inegociáveis que guiam **todas** as specs, planos e código.
> Metodologia: **SDD — Spec-Driven Development** (a especificação é a fonte da verdade; o código é derivado dela).

## I. Spec antes do código
1. Nenhuma funcionalidade é implementada sem `spec.md` (o quê/por quê), `plan.md` (como) e `tasks.md` (passos) em `specs/NNN-nome/`.
2. Cada critério de aceite tem um identificador (`CA-001-01`) e é coberto por ao menos um teste automatizado que cita esse ID.
3. Mudou o comportamento? Primeiro atualiza a spec, depois o código.

## II. Segurança por padrão (SSDLC — Aula 7)
1. **Validação de entrada**: todo dado externo (body, query, params, arquivos) é validado com schema (`zod`) no backend.
2. **Sem SQL dinâmico**: apenas queries parametrizadas (`$1, $2...`).
3. **Autenticação e autorização no servidor**: o frontend só esconde telas; quem decide é o backend (RBAC + verificação de dono do recurso).
4. **Mínimo privilégio**: containers rodam como usuário não-root; o banco não é exposto fora da rede interna; cada perfil acessa só o que precisa.
5. **Segredos fora do código**: senhas, chaves e URLs ficam em variáveis de ambiente (`.env` nunca é commitado).
6. **Erros sem vazamento**: respostas de erro genéricas; detalhes apenas nos logs, sem senha/token.
7. **Criptografia**: senhas com `bcrypt`; tokens JWT assinados e com expiração; TLS em produção (ALB).

## III. Simplicidade
1. Monorepo com dois serviços (frontend e backend) + banco. Sem microserviços desnecessários.
2. Dependências mínimas e conhecidas; cada nova dependência precisa de justificativa no `plan.md`.
3. Portabilidade local → AWS feita **só por configuração** (variáveis de ambiente), nunca por mudança de código.

## IV. Qualidade e pipeline
1. Nenhum merge na `main` sem o pipeline verde: testes + **Quality Gate do SonarQube** + `npm audit` sem vulnerabilidades altas/críticas.
2. Dependências atualizadas via Dependabot.

## V. Documentação
1. Toda decisão de arquitetura relevante é registrada em `specs/000-arquitetura/plan.md` (seção ADR).
2. Documentos de segurança (política, riscos, OWASP, hardening, PCN) vivem em `docs/` e são revisados a cada release.
