# Hardening e Mínimo Privilégio (Aula 10)

## Containers
| Medida | Backend | Frontend | Banco | Por quê |
|---|---|---|---|---|
| Usuário não-root | `USER node` | `nginx-unprivileged` (uid 101) | imagem oficial | Escapar do container não dá root |
| Imagem mínima (alpine) + multi-stage | ✓ | ✓ | ✓ | Menos pacotes = menor superfície de ataque |
| `apk upgrade` no build | ✓ | ✓ | — | Patches do SO |
| Só deps de produção (`npm ci --omit=dev`) | ✓ | (só `dist/` estático) | — | Ferramentas de dev não vão para produção |
| `read_only: true` + `tmpfs /tmp` | ✓ | ✓ | — | Atacante não grava binários |
| `cap_drop: [ALL]` | ✓ | ✓ | — | Remove capabilities do kernel |
| `no-new-privileges` | ✓ | ✓ | ✓ | Bloqueia escalada via setuid |
| `HEALTHCHECK` | ✓ | ✓ | ✓ | Disponibilidade / restart automático |
| `tini` como PID 1 | ✓ | — | — | Sinais e processos zumbis tratados |

## Rede (segmentação)
- `back-net` é `internal: true`: o banco **não tem porta no host** e não sai para a internet.
- Só o frontend publica porta (8080). O backend fica atrás do Nginx.
- Na AWS isso vira: subnet pública só com ALB e NAT; cluster K3s e RDS na subnet privada; Security Groups em cadeia — ALB → workers só na **30080**, RDS aceita 5432 **só** do SG dos workers (matriz completa em [infra/README.md](../../infra/README.md)).

## Kubernetes (K3s — manifests em [k8s/](../../k8s/))
| Controle | Onde | Efeito |
|---|---|---|
| `runAsNonRoot` + uid fixo (1000 backend, 101 Nginx) | `securityContext` dos pods | Nenhum container roda como root |
| `readOnlyRootFilesystem: true` + `emptyDir` só em `/tmp` | containers | Invasor não grava binários nem altera config |
| `allowPrivilegeEscalation: false`, `capabilities: drop [ALL]`, `seccompProfile: RuntimeDefault` | containers | Sem escalada de privilégio nem syscalls desnecessárias |
| Pod Security Admission **`restricted`** | label do namespace `marmifit` | O cluster **recusa** pods que violem as regras acima |
| `automountServiceAccountToken: false` | pods | Um pod comprometido não ganha acesso à API do Kubernetes |
| **NetworkPolicy**: entrada negada por padrão; backend só aceita o frontend | `k8s/base/networkpolicy.yaml` | Segmentação também **dentro** do cluster (o K3s aplica nativamente) |
| `requests`/`limits` de CPU e memória | containers | Um pod não derruba o nó (DoS interno) |
| Backend como `ClusterIP` | Service | A API não é exposta fora do cluster; só o Nginx (NodePort 30080) recebe o ALB |
| Segredos em `Secret` criado com `kubectl create secret` | fora do Git | Nenhuma senha nos manifests |

## Aplicação
- `x-powered-by` desligado, `server_tokens off`, erros genéricos.
- Headers: CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP.
- Timeouts curtos no Nginx contra Slowloris (Aula 4).

## Nós do K3s — EC2 (checklist — CIS Benchmark, resumo)
- [ ] Ubuntu LTS atualizado (`unattended-upgrades` habilitado — automação de patches)
- [ ] SSH só com chave, `PermitRootLogin no`, `PasswordAuthentication no` — ou, melhor, **SSM Session Manager** sem porta 22 aberta
- [ ] Sem IP público; Security Group: workers só recebem 30080 do ALB e o tráfego do cluster (6443, 8472/UDP, 10250); porta 22 fechada (acesso por SSM)
- [ ] `ufw` habilitado como segunda camada
- [ ] `kubeconfig` do K3s (`/etc/rancher/k3s/k3s.yaml`) só para root; token do cluster no SSM Parameter Store (SecureString)
- [ ] IAM Role da instância com política mínima: `s3:PutObject`, `s3:DeleteObject` **apenas** em `arn:aws:s3:::<bucket>/meals/*`
- [ ] CloudWatch Agent coletando logs dos containers
- [ ] IMDSv2 obrigatório na instância
