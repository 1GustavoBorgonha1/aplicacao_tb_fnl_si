# Kubernetes — manifests da MarmiFit

Kustomize (embutido no `kubectl`, sem ferramenta extra). Decisão em ADR-13.

```
k8s/
  base/               namespace (Pod Security "restricted"), backend, frontend, NetworkPolicies
  components/postgres Postgres no cluster (só ambientes locais; na AWS é o RDS)
  overlays/local/     Kubernetes do Docker Desktop: Postgres no cluster + uploads em volume
  overlays/k3d/       Simulação da AWS num K3s de verdade: 1 master + 3 workers, s3mock no papel do S3
```

| Objeto | Tipo | Porta | Observação |
|---|---|---|---|
| `frontend` | Deployment + Service **NodePort** | 8080 → **30080** em todos os nós | Porta do **Target Group do ALB** |
| `backend` | Deployment + Service ClusterIP | 3000 | Nome `backend` usado pelo Nginx (`frontend/proxy.inc`) |
| `db` (só local) | StatefulSet + Service | 5432 | Na AWS é o RDS |

**Segurança aplicada:** containers não-root, `readOnlyRootFilesystem`, `capabilities: drop ALL`, `seccomp RuntimeDefault`, sem token da service account, namespace com Pod Security `restricted`, limites de CPU/memória, **NetworkPolicy** (entrada negada por padrão; backend só aceita o frontend; banco só aceita o backend). Segredos ficam em `Secret` criado fora do Git.

## Simulação da AWS com K3s local (k3d) — recomendado
Um K3s de verdade rodando em containers, com a mesma topologia do diagrama. **Aqui as NetworkPolicies são aplicadas** (no Docker Desktop não são).

| AWS | Simulação k3d |
|---|---|
| ALB → NodePort 30080 dos workers | load balancer do k3d → NodePort 30080 de todos os nós |
| Master + 3 workers (Launch Template) | 1 server (com taint: não roda a aplicação) + 3 agents |
| RDS PostgreSQL | Postgres no cluster (`components/postgres`) |
| S3 | `adobe/s3mock` com `STORAGE_DRIVER=s3` e `S3_ENDPOINT` (mesmo código do driver S3) |

Pré-requisitos: Docker Desktop e k3d (`winget install k3d.k3d`). Use ~12 GB livres em disco.
```bash
# 1. Cluster: 1 master + 3 workers, porta 30080 publicada pelo load balancer
k3d cluster create marmifit --servers 1 --agents 3 -p "30080:30080@loadbalancer"   --k3s-arg "--disable=traefik@server:0" --kubeconfig-switch-context=false
kubectl --context k3d-marmifit taint node k3d-marmifit-server-0 node-role.kubernetes.io/control-plane:NoSchedule

# 2. Segredos (fora do Git): copie os .example e use a MESMA senha no db e no DATABASE_URL
cp k8s/overlays/k3d/db.local.env.example k8s/overlays/k3d/db.local.env
cp k8s/overlays/k3d/backend.local.env.example k8s/overlays/k3d/backend.local.env

# 3. Imagens locais para dentro dos nós (modo direct é o mais confiável no Windows)
docker build -t marmifit-backend:local --target runtime backend
docker build -t marmifit-frontend:local frontend
k3d image import marmifit-backend:local marmifit-frontend:local -c marmifit --mode direct

# 4. Subir e testar
kubectl --context k3d-marmifit apply -k k8s/overlays/k3d
kubectl --context k3d-marmifit -n marmifit wait --for=condition=Ready pod --all --timeout=300s
kubectl --context k3d-marmifit -n marmifit get pods -o wide   # réplicas espalhadas pelos workers
curl localhost:30080/api/health                               # {"status":"ok"} → http://localhost:30080
bash k8s/overlays/k3d/verificar-segmentacao.sh                # prova as NetworkPolicies

# Apagar tudo
k3d cluster delete marmifit
```
Resultado esperado do `verificar-segmentacao.sh`:
```
OK      frontend -> backend:3000                      passa
OK      backend  -> s3:9090                           passa
OK      frontend -> db:5432                           bloqueia
OK      frontend -> s3:9090                           bloqueia
OK      outro namespace -> backend:3000               bloqueia
OK      internet (load balancer) -> 30080             passa
```
Limitação da simulação: a URL das fotos aponta para `http://s3:9090`, que só existe dentro do cluster, então as imagens não aparecem no navegador (na AWS a URL é a do bucket S3, pública em `meals/*`). O envio, a gravação e a remoção no S3 funcionam e são cobertos por teste (`backend/tests/storage-s3.test.js`).

## Teste local (Docker Desktop)
Pré-requisito: Docker Desktop → Settings → Kubernetes → **Enable Kubernetes** (kubeadm).
```bash
# 1. Segredos locais (fora do Git)
cp k8s/overlays/local/db.local.env.example k8s/overlays/local/db.local.env
cp k8s/overlays/local/backend.local.env.example k8s/overlays/local/backend.local.env
#    → use a MESMA senha em POSTGRES_PASSWORD e no DATABASE_URL

# 2. Imagens locais (o Kubernetes do Docker Desktop enxerga as imagens do Docker)
docker build -t marmifit-backend:local --target runtime backend
docker build -t marmifit-frontend:local frontend

# 3. Subir e acompanhar
kubectl config use-context docker-desktop
kubectl apply -k k8s/overlays/local
kubectl -n marmifit wait --for=condition=Ready pod --all --timeout=180s
# No modo "kind" do Docker Desktop o NodePort não chega ao Windows: use port-forward
kubectl -n marmifit port-forward svc/frontend 30080:8080
curl localhost:30080/api/health            # {"status":"ok"}  → abrir http://localhost:30080

# Limpar tudo (inclui o banco local)
kubectl delete -k k8s/overlays/local
```
Obs.: o Docker Desktop não aplica NetworkPolicy (o CNI dele não suporta); elas são aplicadas no **K3s**.

## AWS (K3s)
Na AWS, os manifests oficiais ficam no Terraform (`infra/terraform/manifests/`): o `terraform apply` gera o ConfigMap e o Secret a partir dos outputs e aplica tudo no master via SSM (passo a passo em [infra/terraform/README.md](../infra/terraform/README.md)). Os manifests desta pasta (`base`, `local`, `k3d`) servem para os testes locais; mudanças de segurança devem ser feitas nos dois lugares.
Depois disso a pipeline só troca a imagem (`kubectl set image` + `kubectl rollout status`).

Comandos úteis:
```bash
kubectl -n marmifit get pods -o wide                 # em qual worker cada pod está
kubectl -n marmifit logs deploy/backend | grep audit # eventos de auditoria
kubectl -n marmifit rollout undo deploy/backend      # voltar a versão anterior
```
