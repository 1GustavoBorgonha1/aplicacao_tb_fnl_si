# Spec 005 — Painel Administrativo

- **Status:** implementada
- **Perfis:** admin

## 1. Contexto
O admin "administra tudo": aprova as empresas que entram na plataforma, bloqueia empresas e usuários com problema e acompanha pedidos e marmitas.

## 2. Histórias de usuário
- **HU-005-01** — Como admin, quero ver as empresas por status e aprová-las ou bloqueá-las.
- **HU-005-02** — Como admin, quero ativar/desativar qualquer usuário.
- **HU-005-03** — Como admin, quero ver todos os pedidos e todas as marmitas, e tornar indisponível uma marmita inadequada.
- **HU-005-04** — Como admin, quero um resumo com totais (usuários, empresas pendentes, pedidos).

## 3. Critérios de aceite
- **CA-005-01** — Apenas `role=admin` acessa `/api/admin/*`; demais perfis → **403**.
- **CA-005-02** — Aprovar empresa (`status=aprovado`) a torna visível na listagem pública.
- **CA-005-03** — Bloquear empresa a remove da listagem e impede a gestão (CA-002-04).
- **CA-005-04** — Desativar usuário invalida o acesso imediatamente (CA-001-09).
- **CA-005-05** — O admin não pode desativar a si mesmo (**400**), evitando ficar sem administrador.
- **CA-005-06** — Toda ação administrativa gera log de auditoria com o id do admin.

## 4. Requisitos de segurança
- **RS-005-01** — Rotas administrativas não são "escondidas" — são **protegidas** (Aula 8: forçar URL `admin_getappInfo`).
- **RS-005-02** — Credencial inicial do admin vem do ambiente e deve ser trocada em produção.

## 5. Fora de escopo
Múltiplos níveis de admin, relatórios financeiros.
