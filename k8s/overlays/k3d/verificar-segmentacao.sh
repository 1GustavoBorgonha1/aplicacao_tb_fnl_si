#!/usr/bin/env bash
# Prova as NetworkPolicies no K3s local (overlay k3d). Uso: bash k8s/overlays/k3d/verificar-segmentacao.sh
# Esperado: PASSA nos fluxos permitidos e BLOQUEADO nos demais.
set -u
K="kubectl --context k3d-marmifit"
export MSYS_NO_PATHCONV=1 # Git Bash no Windows

# Só testa com todos os pods prontos (senão o exec pode cair numa réplica ainda subindo).
$K -n marmifit wait --for=condition=Ready pod --all --timeout=180s >/dev/null || { echo "pods não ficaram prontos"; exit 1; }

teste() { # descrição, esperado (passa|bloqueia), comando...
  local desc=$1 esperado=$2; shift 2
  if "$@" >/dev/null 2>&1; then r=passa; else r=bloqueia; fi
  [[ "$r" == "$esperado" ]] && st=OK || st=FALHOU
  printf '%-7s %-45s %s\n' "$st" "$desc" "$r"
}

teste "frontend -> backend:3000"            passa    $K -n marmifit exec deploy/frontend -- wget -qO- -T 4 backend:3000/api/health
teste "backend  -> s3:9090"                 passa    $K -n marmifit exec deploy/backend -- wget -qO- -T 4 s3:9090/
teste "frontend -> db:5432"                 bloqueia $K -n marmifit exec deploy/frontend -- nc -z -w 4 db 5432
teste "frontend -> s3:9090"                 bloqueia $K -n marmifit exec deploy/frontend -- wget -qO- -T 4 s3:9090/
teste "outro namespace -> backend:3000"     bloqueia $K -n default run invasor --image=busybox:1.37 --restart=Never --rm -i --quiet -- wget -qO- -T 4 backend.marmifit:3000/api/health
teste "internet (load balancer) -> 30080"   passa    curl -sf -m 5 localhost:30080/api/health
