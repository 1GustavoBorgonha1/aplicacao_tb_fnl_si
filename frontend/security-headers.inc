# Headers de segurança (incluídos em cada bloco que define add_header,
# porque o Nginx não herda add_header quando o bloco filho define o seu).
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
# Isolamento entre origens (achado do OWASP ZAP): nossos recursos só são carregados pela própria origem;
# COEP "credentialless" (e não "require-corp") porque as fotos vêm do S3, que não envia CORP.
add_header Cross-Origin-Resource-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "credentialless" always;
# CSP: só scripts/estilos da própria origem; imagens só da origem e do S3/CloudFront da AWS
# (antes era "https:", qualquer site — achado CSP Wildcard Directive do OWASP ZAP).
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://*.amazonaws.com https://*.cloudfront.net; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
