# syntax=docker/dockerfile:1
# Frontend MarmiFit — build com Node, runtime com Nginx sem root.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# nginx-unprivileged: roda como uid 101 e escuta na porta 8080 (sem privilégio de root).
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
USER root
RUN apk upgrade --no-cache && rm /etc/nginx/conf.d/default.conf
USER nginx
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/marmifit.conf
COPY --chown=nginx:nginx proxy.inc security-headers.inc /etc/nginx/conf.d/
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
