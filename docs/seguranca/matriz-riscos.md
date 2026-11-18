# Gestão de Riscos — Matriz Probabilidade × Impacto (Aula 9)

## 1. Ativos
| Ativo | Tipo | Valor | Por quê |
|---|---|---|---|
| Banco de dados (usuários, pedidos, CNPJs) | Dados | **Alto** | Dados pessoais (LGPD) e operação do negócio |
| Credenciais (senhas, `JWT_SECRET`, chaves AWS) | Segredo | **Alto** | Comprometimento total do sistema |
| Imagens das marmitas (pasta/S3) | Dados | Médio | Vitrine dos restaurantes |
| API backend / Frontend | Software | Alto | Disponibilidade = vendas |
| Pipeline GitHub Actions / repositório | Processo | Alto | Porta de entrada para código malicioso |
| Instâncias EC2 / RDS | Infra | Alto | Hospedagem |

## 2. Escalas
- **Probabilidade:** 1 Rara · 2 Improvável · 3 Possível · 4 Provável · 5 Quase certa
- **Impacto:** 1 Insignificante · 2 Menor · 3 Moderado · 4 Maior · 5 Catastrófico
- **Nível = P × I:** 1–4 **Baixo** · 5–9 **Médio** · 10–16 **Alto** · 20–25 **Crítico**

## 3. Matriz

```
            Impacto →   1        2        3        4        5
Prob. 5            |        |        |        |        |        |
      4            |        |        |  R07   |  R01   |        |
      3            |        |  R09   |  R05   |  R03   |  R02   |
      2            |        |        |  R08   |  R04   |  R06   |
      1            |        |        |        |  R10   |        |
```

## 4. Registro de riscos

| ID | Risco | P | I | Nível | Tratamento | Ação / Controle |
|---|---|---|---|---|---|---|
| R01 | Força bruta / credential stuffing no login | 4 | 4 | **Alto (16)** | Mitigar | Rate limit app + Nginx + WAF; política de senha; logs `login_failed`; troca de senha pelo usuário com revogação das sessões (spec 006) |
| R11 | Senha padrão do admin (vinda do `.env`) mantida em produção | 3 | 5 | **Alto (15)** | Mitigar | Tela **Minha conta** (spec 006): trocar a senha do admin no primeiro acesso; procedimento no [deploy](../deploy-aws.md) |
| R02 | Vazamento do banco (SQLi ou RDS exposto) | 3 | 5 | **Alto (15)** | Mitigar | Queries parametrizadas; RDS em subnet privada, SG só da EC2; criptografia em repouso |
| R03 | IDOR — acesso a dados de outro restaurante/cliente | 3 | 4 | **Alto (12)** | Mitigar | Verificação de dono em todas as queries; testes CA-003-03, CA-004-05/06 |
| R04 | Dependência com vulnerabilidade conhecida | 2 | 4 | Médio (8) | Mitigar | `npm audit` bloqueante + Dependabot + SonarQube |
| R05 | Indisponibilidade (DoS, queda da EC2) | 3 | 3 | Médio (9) | Mitigar / Transferir | WAF, rate limit, health check no ALB, restart automático; AWS (responsabilidade compartilhada) |
| R06 | Vazamento de segredo (`.env` commitado, chave AWS) | 2 | 5 | **Alto (10)** | Evitar | `.gitignore`, IAM Role (sem access keys), SonarQube detecta segredos, rotação |
| R07 | Upload malicioso (webshell, arquivo gigante) | 4 | 3 | **Alto (12)** | Mitigar | Magic bytes, limite 2 MB, nome UUID, bucket sem execução |
| R08 | Perda de dados (exclusão acidental, falha de disco) | 2 | 3 | Médio (6) | Mitigar | Backups automáticos do RDS (7 dias) + snapshot manual antes de deploy; versionamento S3 |
| R09 | Pedido fantasma (cliente não retira — pagamento no local) | 3 | 2 | Médio (6) | Aceitar | Restaurante pode cancelar; risco de negócio, não técnico |
| R10 | Comprometimento da conta GitHub / pipeline | 1 | 4 | Baixo (4) | Mitigar | MFA na conta, branch protection na `main`, `permissions` mínimas, environment com aprovação |

## 5. Plano de ação por nível
| Nível | Prazo | Resposta |
|---|---|---|
| **Crítico** | Imediato | Interromper o serviço afetado, acionar o [PRI](../continuidade/pcn-pri-dr.md), correção emergencial |
| **Alto** | Até a próxima release | Controle técnico obrigatório + teste automatizado que comprove a mitigação |
| **Médio** | Backlog priorizado | Controle planejado, monitorar indicadores |
| **Baixo** | Revisão semestral | Aceitar e documentar |

## 6. Monitoramento e revisão
- A matriz é revisada a cada nova spec (SDD) e a cada incidente.
- Indicadores: nº de `login_failed`/`login_rate_limited` por dia, vulnerabilidades abertas no SonarQube, alertas do Dependabot.
