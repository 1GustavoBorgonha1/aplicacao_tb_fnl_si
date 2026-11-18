# Kubernetes — manifests da MarmiFit

Kustomize (embutido no `kubectl`, sem ferramenta extra). Decisão em ADR-13.

```
k8s/
  base/               namespace (Pod Security "restricted"), backend, frontend, NetworkPolicies
  overlays/local/     Kubernetes do Docker Desktop: Postgres no cluster + uploads em volume
  overlays/aws/       K3s na AWS: RDS PostgreSQL + S3, imagens do Docker Hub
```

| Objeto | Tipo | Porta | Observação |
|---|---|---|---|
| `frontend` | Deployment + Service **NodePort** | 8080 → **30080** em todos os nós | Porta do **Target Group do ALB** |
| `backend` | Deployment + Service ClusterIP | 3000 | Nome `backend` usado pelo Nginx (`frontend/proxy.inc`) |
| `db` (só local) | StatefulSet + Service | 5432 | Na AWS é o RDS |

**Segurança aplicada:** containers não-root, `readOnlyRootFilesystem`, `capabilities: drop ALL`, `seccomp RuntimeDefault`, sem token da service account, namespace com Pod Security `restricted`, limites de CPU/memória, **NetworkPolicy** (entrada negada por padrão; backend só aceita o frontend; banco só aceita o backend). Segredos ficam em `Secret` criado fora do Git.

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
Passo a passo no topo de [overlays/aws/kustomization.yaml](overlays/aws/kustomization.yaml): preencher os valores `TROQUE` com as saídas do Terraform, criar o `backend-secret` com `kubectl create secret` e `kubectl apply -k k8s/overlays/aws`.
Depois disso a pipeline só troca a imagem (`kubectl set image` + `kubectl rollout status`).

Comandos úteis:
```bash
kubectl -n marmifit get pods -o wide                 # em qual worker cada pod está
kubectl -n marmifit logs deploy/backend | grep audit # eventos de auditoria
kubectl -n marmifit rollout undo deploy/backend      # voltar a versão anterior
```
