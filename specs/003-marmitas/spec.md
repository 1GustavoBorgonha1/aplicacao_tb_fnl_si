# Spec 003 — Marmitas (Catálogo)

- **Status:** implementada
- **Perfis:** restaurante, cliente, visitante

## 1. Contexto
Cada restaurante cadastra suas marmitas com foto e informação nutricional — diferencial da proposta de valor da MarmiFit (BMC: "opções personalizadas", low carb, vegana, sem glúten).

## 2. Histórias de usuário
- **HU-003-01** — Como restaurante, quero cadastrar, editar e remover marmitas com foto.
- **HU-003-02** — Como restaurante, quero marcar uma marmita como indisponível sem apagá-la.
- **HU-003-03** — Como cliente, quero ver o catálogo de um restaurante, com preço, calorias, proteína e categoria, e filtrar por categoria.

## 3. Critérios de aceite
- **CA-003-01** — Restaurante cria marmita com `nome, preco, categoria` (obrigatórios) e `descricao, kcal, proteina_g, imagem` (opcionais) → **201**.
- **CA-003-02** — `GET /api/restaurants/:id/meals` mostra apenas marmitas `disponivel=true` de restaurante aprovado; aceita `?categoria=`.
- **CA-003-03** — Restaurante A não edita nem remove marmita do restaurante B (**404**).
- **CA-003-04** — Imagem aceita apenas JPEG, PNG ou WEBP, validados pelo **conteúdo** (magic bytes), até 2 MB; outro tipo → **400**.
- **CA-003-05** — O arquivo é salvo com nome aleatório (UUID); o nome original é descartado.
- **CA-003-06** — Ao trocar ou remover a imagem/marmita, o arquivo antigo é apagado do storage.
- **CA-003-07** — Remover marmita que já está em pedidos preserva o histórico (o item do pedido guarda nome e preço).
- **CA-003-08** — Preço deve ser > 0 e ≤ R$ 1.000,00.

### Requisitos de interface (UX — sem efeito na validação do servidor)
- **UX-003-01** — O campo de preço usa máscara de moeda "caixa registradora": o restaurante digita só números e a vírgula anda da direita para a esquerda (digitar `2`, `5`, `9`, `0` mostra `R$ 25,90`); apagar remove o último dígito; colar texto aproveita só os dígitos; não passa de R$ 1.000,00. O valor enviado é sempre `preco_centavos` inteiro — o CA-003-08 continua sendo garantido pelo backend.

## 4. Requisitos de segurança
- **RS-003-01** — Upload em memória com limite de tamanho (DoS por arquivo grande).
- **RS-003-02** — Verificação de assinatura binária, não do `Content-Type` do cliente (upload de `.php`/script disfarçado).
- **RS-003-03** — Imagens servidas com `X-Content-Type-Options: nosniff`.
- **RS-003-04** — Em produção: bucket S3 privado, acesso de leitura só pelo app/CloudFront.

## 5. Fora de escopo
Redimensionamento de imagem, múltiplas fotos por marmita, estoque.
