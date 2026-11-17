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
- Na AWS isso vira: subnet privada para RDS (SG aceita 5432 **só** do SG da EC2), EC2 recebendo tráfego **só** do ALB.

## Aplicação
- `x-powered-by` desligado, `server_tokens off`, erros genéricos.
- Headers: CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP.
- Timeouts curtos no Nginx contra Slowloris (Aula 4).

## Servidor EC2 (checklist — CIS Benchmark Ubuntu, resumo)
- [ ] Ubuntu LTS atualizado (`unattended-upgrades` habilitado — automação de patches)
- [ ] SSH só com chave, `PermitRootLogin no`, `PasswordAuthentication no` — ou, melhor, **SSM Session Manager** sem porta 22 aberta
- [ ] Security Group: entrada 80/443 só do ALB; 22 só do IP do administrador (ou fechado com SSM)
- [ ] `ufw` habilitado como segunda camada
- [ ] Usuário dedicado no grupo `docker`, sem uso de root no dia a dia
- [ ] IAM Role da instância com política mínima: `s3:PutObject`, `s3:DeleteObject` **apenas** em `arn:aws:s3:::<bucket>/meals/*`
- [ ] CloudWatch Agent coletando logs dos containers
- [ ] IMDSv2 obrigatório na instância
