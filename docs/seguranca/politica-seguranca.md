# Política de Segurança da Informação — MarmiFit (Aula 2)

> Baseada nos princípios da ISO/IEC 27001/27002 e na LGPD (Lei 13.709/2018).

## 1. Objetivo
Proteger a **confidencialidade, integridade e disponibilidade** (tríade CID) dos dados de clientes, restaurantes e da operação da plataforma.

## 2. Escopo
Aplicação MarmiFit (frontend, backend, banco, armazenamento de imagens), pipeline CI/CD, repositório e infraestrutura AWS.

## 3. Como a MarmiFit atende os pilares
| Pilar | Controles |
|---|---|
| **Confidencialidade** | Senhas com bcrypt; RBAC; dados pessoais não expostos em rotas públicas; TLS; banco em rede privada |
| **Integridade** | Validação de entrada; total do pedido calculado no servidor; transações; constraints no banco; Quality Gate |
| **Disponibilidade** | Containers com restart e health check; rate limit/WAF; backups do RDS; [PCN](../continuidade/pcn-pri-dr.md) |
| **Autenticidade** | Login com senha forte + JWT assinado |
| **Não repúdio** | Logs de auditoria com usuário, ação, IP e horário |

## 4. Diretrizes
1. **Controle de acesso:** princípio do mínimo privilégio. Três perfis (admin, restaurante, cliente); admin só criado via ambiente.
2. **Senhas:** mínimo 8 caracteres com letras e números; nunca armazenadas em texto claro, nunca registradas em log.
3. **Segredos:** somente em variáveis de ambiente / GitHub Secrets / AWS. Proibido commitar `.env`.
4. **Desenvolvimento seguro:** todo código segue o SSDLC — spec com requisitos de segurança → código → testes → SonarQube.
5. **Dependências:** atualizações de segurança aplicadas em até 7 dias (alto/crítico).
6. **Logs:** retidos por 90 dias; acesso restrito ao time técnico.
7. **Incidentes:** tratados conforme o [Plano de Resposta a Incidentes](../continuidade/pcn-pri-dr.md).

## 5. Privacidade e LGPD
| Item | Prática |
|---|---|
| Dados coletados | Cliente: nome, e-mail. Restaurante: nome do responsável, e-mail, CNPJ, telefone, endereço. Pedidos. |
| Dados **não** coletados | Dados de pagamento (pagamento é no local), CPF, localização |
| Finalidade | Viabilizar o pedido e a retirada da marmita |
| Base legal | Execução de contrato (art. 7º, V) |
| Minimização | Apenas o necessário para o pedido; dados do restaurante públicos se restringem a nome, telefone, endereço e horário |
| Direitos do titular | Solicitação de acesso/correção/exclusão pelo e-mail de contato do administrador (`privacidade@marmifit.local`) |
| Compartilhamento | O restaurante vê apenas o **nome** do cliente que fez o pedido |

## 6. Responsabilidades
| Papel | Responsabilidade |
|---|---|
| Administrador da plataforma | Aprovar empresas, gerir usuários, acionar o PRI |
| Desenvolvedores | Seguir a constituição do projeto e corrigir achados do SonarQube |
| Restaurantes | Manter dados corretos e proteger sua senha |

## 7. Revisão
Esta política é revisada semestralmente ou após incidente relevante.
