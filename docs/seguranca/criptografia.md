# Criptografia na MarmiFit (Aula 3)

| Dado | Estado | Técnica | Tipo | Onde |
|---|---|---|---|---|
| Senhas | Repouso | **bcrypt** (custo 12, salt aleatório por senha) | Hash unidirecional, lento de propósito | `backend/src/services/password.js` |
| Token de sessão | Trânsito | **JWT HS256** (HMAC-SHA256), expira em 2h | Assinatura simétrica (integridade + autenticidade) | `backend/src/services/token.js` |
| Tráfego navegador ↔ ALB | Trânsito | **TLS 1.2+** com certificado ACM | Assimétrica (troca de chaves) + AES (sessão) | ALB (AWS) |
| App ↔ RDS | Trânsito | **TLS** (`DATABASE_SSL=true`) | Idem | `backend/src/db/pool.js` |
| Banco RDS | Repouso | **AES-256** via KMS | Simétrica | Configuração do RDS |
| Imagens no S3 | Repouso | **SSE-S3 (AES-256)** | Simétrica | `backend/src/storage/s3.js` |

## Por que cada escolha
- **bcrypt e não SHA-256:** hashes rápidos permitem bilhões de tentativas por segundo em GPU; bcrypt é adaptativo (o custo pode subir com o tempo) e embute o salt, inviabilizando *rainbow tables*.
- **HS256 com algoritmo fixo:** a verificação aceita somente `HS256`, impedindo o ataque clássico de trocar o header para `alg: none`. Há teste para isso (CA-001-07).
- **Segredo forte:** `JWT_SECRET` com ≥ 32 caracteres é validado no startup; gere com `openssl rand -base64 48`.
- **Simétrica × assimétrica (aula):** AES protege grandes volumes (disco, S3, sessão TLS) por ser rápido; a criptografia assimétrica (RSA/ECDHE) é usada no TLS apenas para autenticar o servidor e combinar a chave AES da sessão.

## O que NÃO fazemos (de propósito)
- Não "criptografamos" senhas de forma reversível: hash não tem chave para vazar.
- Não usamos cifras clássicas (César/Vigenère) — servem para estudo, são quebradas por análise de frequência.
