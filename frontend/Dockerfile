# syntax=docker/dockerfile:1
# Frontend MarmiFit — build com Node, runtime com Nginx sem root.

FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# nginx-unprivileged: roda como uid 101 e escuta na porta 8080 (sem privilégio de root).
FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime
USER root
RUN apk upgrade --no-cache && rm /etc/nginx/conf.d/default.conf
# Arquivos da imagem ficam com dono root (somente leitura para o uid 101 do Nginx):
# mesmo que o processo seja comprometido, ele não altera config nem o site.
COPY nginx.conf /etc/nginx/conf.d/marmifit.conf
COPY proxy.inc security-headers.inc /etc/nginx/conf.d/
COPY --from=build /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
