# Plano 003 — Marmitas

> Referência: [spec.md](spec.md)

## Endpoints
| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| GET | `/api/restaurants/:id/meals` | público | Catálogo disponível (`?categoria=`) |
| GET | `/api/meals/mine` | restaurante | Todas as marmitas da própria empresa |
| POST | `/api/meals` | restaurante | `multipart/form-data` (campos + `imagem`) |
| PUT | `/api/meals/:id` | restaurante (dono) | Atualiza campos e, opcionalmente, a imagem |
| DELETE | `/api/meals/:id` | restaurante (dono) | Remove marmita e imagem |
| GET | `/uploads/:key` | público | Arquivo de imagem (driver local) |

## Validação (zod)
`nome` 2–100 · `descricao` ≤ 500 · `preco_centavos` int 1–100000 · `kcal` int 0–5000 · `proteina_g` int 0–500 · `categoria` ∈ {tradicional, low_carb, vegana, vegetariana, sem_gluten} · `disponivel` boolean.

## Storage (ADR-05)
```js
storage.save(buffer, ext) -> key      // ex.: "meals/3f2c...e1.webp"
storage.remove(key)
storage.url(key) -> string            // local: "/uploads/<key>" · s3: "${S3_PUBLIC_URL}/<key>"
```
`STORAGE_DRIVER=local` grava em `UPLOAD_DIR` (volume Docker). `STORAGE_DRIVER=s3` usa `S3_BUCKET`, `AWS_REGION` (credenciais pela IAM Role da EC2 — sem chaves no `.env`).

## Arquivos
- `backend/src/routes/meals.js`, `backend/src/middlewares/upload.js`, `backend/src/storage/*`, `backend/tests/meals.test.js`
- Frontend: `pages/cliente/Catalogo.jsx`, `pages/restaurante/MinhasMarmitas.jsx`, `components/MoneyInput.jsx` (máscara de moeda, UX-003-01; o estado do formulário guarda centavos inteiros)

## Dependências novas
`multer` (upload), `@aws-sdk/client-s3` (driver S3).
