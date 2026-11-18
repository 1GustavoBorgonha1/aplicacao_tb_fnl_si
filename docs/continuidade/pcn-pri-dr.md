# Continuidade de Negócio, Resposta a Incidentes e Recuperação de Desastres (Aula 11)

## 1. Análise de Impacto no Negócio (BIA)
| Processo | Criticidade | RTO (tempo máx. parado) | RPO (perda máx. de dados) |
|---|---|---|---|
| Receber pedidos | Alta (horário de almoço = pico) | 1 h | 15 min |
| Restaurante atualizar status | Alta | 1 h | 15 min |
| Cadastro de marmitas | Média | 8 h | 24 h |
| Cadastro / aprovação de empresas | Baixa | 24 h | 24 h |

**Contingência manual:** se o sistema cair no horário de pico, o restaurante atende por telefone (exibido na listagem) e registra os pedidos depois.

## 2. Estratégias de continuidade
| Ameaça | Estratégia |
|---|---|
| Queda de um pod | Kubernetes recria o pod (readiness/liveness probes); 2+ réplicas espalhadas pelos workers |
| Queda de um worker | Auto Scaling Group do Launch Template sobe outro nó, que entra no cluster com o token do master; os pods são reagendados |
| Perda de toda a infraestrutura (região, conta, exclusão acidental) | **Terraform** recria tudo a partir do Git (ADR-12) |
| Perda/corrupção do banco | RDS com backup automático (retenção 7 dias, point-in-time recovery) + snapshot manual antes de cada deploy |
| Exclusão de imagens | Versionamento habilitado no bucket S3 |
| Deploy com bug | Rollback: `kubectl -n marmifit rollout undo deployment/backend` ou `set image` com a tag (SHA) anterior no Docker Hub |
| Ataque DDoS | WAF (rate-based rule) + AWS Shield Standard |

## 3. Backup e restauração (ambiente local)
```bash
# Backup do banco
docker compose exec -T db pg_dump -U marmifit -Fc marmifit > backup_$(date +%F).dump
# Restauração
docker compose exec -T db pg_restore -U marmifit -d marmifit --clean < backup_AAAA-MM-DD.dump
# Backup das imagens
docker run --rm -v marmifit_uploads:/data -v "$PWD":/out alpine tar czf /out/uploads_$(date +%F).tgz -C /data .
```
Teste de restauração: **mensal**, em ambiente separado.

## 4. Plano de Resposta a Incidentes (PRI)

### Papéis
| Papel | Quem | Função |
|---|---|---|
| Coordenador | Administrador da plataforma | Decide, comunica, aciona o time |
| Técnico | Desenvolvedor de plantão | Contém, investiga e corrige |
| Comunicação | Coordenador | Avisa restaurantes/clientes e, se houver dados pessoais, a ANPD |

### Fases
1. **Detecção** — alertas de logs (`login_rate_limited` em massa, erros 5xx), SonarQube/Dependabot, relato de usuário.
2. **Classificação** — usar a [matriz de riscos](../seguranca/matriz-riscos.md): Crítico / Alto / Médio / Baixo.
3. **Contenção** — desativar usuário/empresa pelo painel admin; bloquear IP no WAF; se necessário, `docker compose stop frontend` (modo manutenção).
4. **Erradicação** — corrigir a causa (patch, rotação de `JWT_SECRET` — invalida todos os tokens —, troca de senhas do banco).
5. **Recuperação** — deploy da correção pelo pipeline (passa pelo Quality Gate); restaurar backup se houver dano aos dados.
6. **Lições aprendidas** — registrar o incidente, atualizar specs, matriz de riscos e testes.

### Playbooks rápidos
| Cenário | Ações imediatas |
|---|---|
| Vazamento de `JWT_SECRET` | Gerar novo segredo → atualizar `.env`/Secrets → reiniciar backend (todas as sessões caem) |
| Conta de restaurante comprometida | Admin desativa o usuário → investigar logs `audit` → reativar após troca de senha |
| Vulnerabilidade crítica em dependência | Atualizar via Dependabot/`npm audit fix` → pipeline → deploy em até 24 h |
| Vazamento de dados pessoais | Conter → avaliar escopo → comunicar titulares e ANPD em prazo razoável (LGPD art. 48) |

### Comunicação (modelo)
> "Identificamos uma instabilidade/incidente em [data/hora] que afetou [serviço]. [Dados afetados ou "nenhum dado pessoal foi afetado"]. Medidas tomadas: [...]. Próxima atualização em [horário]."

## 5. Recuperação de desastres (DR) — passo a passo
A infraestrutura inteira está descrita em código (`infra/terraform/`), as imagens estão no Docker Hub com a tag de cada commit e o banco tem backup automático. Recuperar é **reexecutar**, não reconstruir à mão:

1. **Infraestrutura:** `terraform apply` (na mesma região ou em outra, trocando a variável de região). Recria VPC, subnets, NAT, SGs, ALB + WAF, master e workers do K3s, buckets e RDS.
2. **Banco:** restaurar o RDS a partir do **snapshot mais recente** ou por *point-in-time* (backup diário, retenção de 7 dias; snapshot manual antes de cada deploy). Para outra região, copiar antes o snapshot para ela.
3. **Aplicação:** no master, criar o `backend-secret` com o endpoint do RDS restaurado e rodar `kubectl apply -k k8s/overlays/aws` com a última tag estável. Os workers puxam as imagens do Docker Hub.
4. **Imagens das marmitas:** bucket S3 com versionamento; em DR regional, replicação ou cópia (`aws s3 sync`) para o bucket da nova região.
5. **Validar:** Target Group com os 3 workers *healthy*, `GET /api/health` = `{"status":"ok"}`, login e um pedido de teste.

| Indicador | Meta | Como é atingido |
|---|---|---|
| **RTO** | ≈ 1 h | `terraform apply` (~15–30 min, RDS é o mais lento) + restore + `kubectl apply` |
| **RPO** | ≤ 5 min com *point-in-time*; ≤ 24 h se só houver o snapshot diário | Backups automáticos do RDS |

## 6. Testes do plano
- Simulação semestral (ex.: "o banco caiu às 11h30").
- Após cada simulação, revisar RTO/RPO e este documento.
