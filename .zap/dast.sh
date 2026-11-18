#!/usr/bin/env bash
# DAST da MarmiFit: sobe a aplicação inteira (Nginx + API + Postgres) e roda o OWASP ZAP baseline.
# Uso: bash .zap/dast.sh   (na raiz do repositório; precisa de Docker)
# Saída: zap/relatorio-zap.html e zap/relatorio-zap.json. Regras e justificativas em .zap/regras.tsv.
# Falha (código ≠ 0) em qualquer alerta WARN ou FAIL que não esteja marcado como IGNORE nas regras.
set -euo pipefail

ZAP_IMAGE="zaproxy/zap-stable:2.17.0@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af"
ALVO="${ALVO:-http://localhost:8080}"

# Segredos aleatórios e descartáveis (nada fixo no código).
if [[ ! -f .env ]]; then
  pg_senha=$(openssl rand -hex 16)
  jwt=$(openssl rand -base64 48 | tr -d '\n')
  sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pg_senha}|" \
      -e "s|^JWT_SECRET=.*|JWT_SECRET=${jwt}|" \
      .env.example > .env
fi
docker compose up -d --build --wait --wait-timeout 300

# O ZAP escreve os relatórios dentro do próprio container; depois copiamos para ./zap
# (sem abrir permissão de escrita numa pasta do host). -j: spider AJAX, a interface é uma SPA.
docker rm -f marmifit-zap >/dev/null 2>&1 || true
set +e
docker run --name marmifit-zap --network host \
  -v "$PWD/.zap/regras.tsv:/zap/wrk/regras.tsv:ro" "$ZAP_IMAGE" \
  zap-baseline.py -t "$ALVO" -c regras.tsv -j -r relatorio-zap.html -J relatorio-zap.json "$@"
rc=$?
set -e
mkdir -p zap
docker cp marmifit-zap:/zap/wrk/relatorio-zap.html zap/ >/dev/null
docker cp marmifit-zap:/zap/wrk/relatorio-zap.json zap/ >/dev/null
docker rm marmifit-zap >/dev/null
echo "ZAP terminou com código $rc (0 = sem alertas; 1 = FAIL; 2 = WARN; 3 = erro)"
exit "$rc"
