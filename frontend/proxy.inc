# Configuração comum de proxy para o backend.
proxy_pass http://backend:3000;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_connect_timeout 5s;
proxy_read_timeout 30s;
# O Nginx é a fonte única dos headers de segurança: remove os equivalentes do helmet
# para não enviar headers duplicados/conflitantes (o helmet continua protegendo acesso direto).
proxy_hide_header X-Frame-Options;
proxy_hide_header X-Content-Type-Options;
proxy_hide_header Referrer-Policy;
proxy_hide_header Content-Security-Policy;
proxy_hide_header Cross-Origin-Opener-Policy;
proxy_hide_header Cross-Origin-Resource-Policy;
proxy_hide_header Cross-Origin-Embedder-Policy;
