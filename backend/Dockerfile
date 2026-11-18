# syntax=docker/dockerfile:1
# Backend MarmiFit — multi-stage, imagem final mínima e sem root (docs/seguranca/hardening.md).

FROM node:26-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# ---- dependências de produção ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---- stage de teste (usado pelo docker-compose.test.yml) ----
FROM base AS test
ENV NODE_ENV=test
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
CMD ["npm", "run", "test:coverage"]

# ---- imagem final ----
FROM base AS runtime
# Atualiza pacotes do SO (patches de segurança) e instala tini para tratar sinais.
RUN apk upgrade --no-cache && apk add --no-cache tini
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node migrations ./migrations
RUN mkdir -p /app/uploads && chown node:node /app/uploads

# Princípio do mínimo privilégio: roda como usuário "node" (uid 1000).
USER node
ENV PORT=3000 UPLOAD_DIR=/app/uploads
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
