# Spec 000 — Arquitetura do Sistema

- **Status:** aprovada
- **Disciplina:** Auditoria e Segurança de Sistemas (atividade da Aula 7 — SSDLC)

## 1. Contexto
A MarmiFit (projeto de Empreendedorismo & Inovação) é uma plataforma que conecta **restaurantes** que produzem marmitas fitness a **clientes** que querem comer de forma saudável sem cozinhar. O sistema é um marketplace simples: o cliente escolhe um restaurante, vê o catálogo e faz o pedido. **Não há entrega**: a retirada e o pagamento são feitos no local.

## 2. Perfis
| Perfil | Descrição |
|---|---|
| **visitante** | Não autenticado. Pode se cadastrar como cliente ou empresa e fazer login. |
| **cliente** | Escolhe restaurante, vê catálogo, faz e acompanha pedidos. |
| **restaurante** | Mantém os dados da empresa e as marmitas, e atende os pedidos recebidos. |
| **admin** | Administra tudo: aprova/bloqueia empresas, ativa/desativa usuários, vê pedidos e marmitas. |

## 3. Funcionalidades (uma spec cada)
| Spec | Funcionalidade |
|---|---|
| [001](../001-autenticacao/spec.md) | Cadastro (cliente/empresa), login e controle de acesso |
| [002](../002-restaurantes/spec.md) | Dados da empresa e listagem pública de restaurantes |
| [003](../003-marmitas/spec.md) | Catálogo de marmitas com imagem |
| [004](../004-pedidos/spec.md) | Pedidos para retirada |
| [005](../005-admin/spec.md) | Painel administrativo |

## 4. Requisitos não funcionais
- **RNF-01 — Conteinerização:** cada serviço roda em um container Docker; ambiente local sobe com um único `docker compose up`.
- **RNF-02 — Portabilidade para AWS:** trocar Postgres local → **RDS** e pasta local → **S3** apenas via variáveis de ambiente.
- **RNF-03 — Segregação de rede:** o banco só é acessível pelo backend (rede interna), espelhando a subnet privada da AWS.
- **RNF-04 — Pipeline:** todo push roda testes, **SonarQube** (Quality Gate) e auditoria de dependências antes do build/deploy.
- **RNF-05 — Observabilidade:** logs estruturados em JSON (stdout) e endpoint `/api/health` para o Load Balancer.
- **RNF-06 — Segurança:** seguir a [constituição](../../.specify/memory/constitution.md) e o mapeamento OWASP em [docs/seguranca/owasp-mitigacoes.md](../../docs/seguranca/owasp-mitigacoes.md).

## 5. Fora de escopo
Entrega/logística, pagamento online, chat com nutricionista, app mobile nativo.
