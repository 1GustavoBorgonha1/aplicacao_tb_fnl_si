# Spec 001 — Autenticação e Controle de Acesso

- **Status:** implementada
- **Perfis:** visitante, cliente, restaurante, admin

## 1. Contexto
Na tela inicial o usuário escolhe **"Sou cliente"** ou **"Sou empresa"** e se cadastra. Depois faz login e é levado à área do seu perfil. O admin não se cadastra: é criado pelo *seed* com credenciais do `.env`.

## 2. Histórias de usuário
- **HU-001-01** — Como visitante, quero me cadastrar como cliente, para fazer pedidos.
- **HU-001-02** — Como visitante, quero cadastrar minha empresa (dados do usuário + dados da empresa), para vender marmitas.
- **HU-001-03** — Como usuário cadastrado, quero fazer login, para acessar minha área.
- **HU-001-04** — Como sistema, quero garantir que cada perfil acesse apenas suas funções.

## 3. Critérios de aceite
- **CA-001-01** — Cadastro de cliente com nome, e-mail e senha válidos retorna **201** e cria usuário com `role=cliente`.
- **CA-001-02** — Cadastro de empresa cria usuário `role=restaurante` **e** restaurante com `status=pendente`, na mesma transação.
- **CA-001-03** — E-mail (ou CNPJ) já cadastrado retorna **409**.
- **CA-001-04** — Senha com menos de 8 caracteres, sem letra ou sem número retorna **400**.
- **CA-001-05** — Login correto retorna **200** com `token` e dados do usuário (sem `senha_hash`).
- **CA-001-06** — Login incorreto retorna **401** com a mesma mensagem para e-mail inexistente e senha errada.
- **CA-001-07** — Rota protegida sem token ou com token inválido retorna **401**.
- **CA-001-08** — Rota de outro perfil (ex.: cliente em `/api/admin/*`) retorna **403**.
- **CA-001-09** — Usuário desativado pelo admin não consegue logar (**403**) e seus tokens existentes deixam de valer.
- **CA-001-10** — Após N tentativas de login **com falha** no intervalo (padrão 10 / 15 min) por IP, retorna **429**. Logins bem-sucedidos **não** consomem o limite (uso normal — vários logins/logouts — nunca é bloqueado).
- **CA-001-11** — Não é possível se cadastrar como `admin` (campo `role` do body é ignorado).

## 4. Requisitos de segurança
- **RS-001-01** — Senhas armazenadas com bcrypt (custo 12); nunca retornadas pela API nem logadas.
- **RS-001-02** — JWT HS256 com segredo de ≥ 32 caracteres vindo do ambiente, expiração de 2h.
- **RS-001-03** — Mensagem de erro de login genérica (evita enumeração de usuários).
- **RS-001-04** — Rate limit no login e no cadastro (força bruta — Hydra, Aula 8). No login contam só as falhas (10 / 15 min por IP, `LOGIN_RATE_LIMIT`); o Nginx ainda limita rajadas (2 req/s, burst 10).
- **RS-001-05** — Logs de auditoria para login com sucesso, falha e bloqueio (sem senha).
- **RS-001-06** — E-mail normalizado (minúsculas e sem espaços) antes de salvar/comparar.

## 5. Ameaças (STRIDE)
| Ameaça | Exemplo | Mitigação |
|---|---|---|
| Spoofing | Força bruta de senha | RS-001-04, política de senha |
| Tampering | Alterar `role` no JWT | Assinatura HS256; role relida do banco |
| Repudiation | "Não fui eu que loguei" | Log de auditoria com IP e horário |
| Info disclosure | Enumerar e-mails | RS-001-03 |
| Elevation | Cadastrar-se como admin | CA-001-11 |

## 6. Fora de escopo
Recuperação de senha por e-mail, MFA, login social.
