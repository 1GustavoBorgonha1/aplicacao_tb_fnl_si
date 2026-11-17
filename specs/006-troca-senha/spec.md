# Spec 006 — Troca de senha

- **Status:** implementada
- **Perfis envolvidos:** cliente, restaurante, admin

## 1. Contexto / Problema
Hoje não existe forma de um usuário trocar a própria senha. O caso mais grave é o **admin**: ele é criado pelo *seed* com a senha do `.env` e, em produção, essa senha inicial precisa ser trocada logo após o primeiro acesso (política de segurança — senhas padrão são um risco OWASP A07). Além disso, se um usuário suspeitar que a senha vazou, trocá-la deve **derrubar as sessões abertas** em outros dispositivos.

## 2. Histórias de usuário
- **HU-006-01** — Como usuário autenticado (cliente, restaurante ou admin), quero trocar minha senha informando a senha atual, para manter minha conta segura.
- **HU-006-02** — Como usuário que suspeita de acesso indevido, quero que a troca de senha encerre as outras sessões abertas, para expulsar quem estiver usando minha conta.
- **HU-006-03** — Como admin, quero trocar a senha inicial definida no `.env`, para não manter em produção uma senha que está em arquivo de configuração.

## 3. Critérios de aceite
- **CA-006-01** — Dado um usuário autenticado, quando envia a senha atual correta e uma nova senha válida, então recebe **200** com um **novo token**, consegue logar com a nova senha e **não** consegue logar com a antiga. Vale para todos os perfis, inclusive admin.
- **CA-006-02** — Senha atual incorreta retorna **400** com `detalhes.senha_atual` e a senha **não** é alterada. (Não é 401, para não confundir com sessão expirada e deslogar o usuário no frontend.)
- **CA-006-03** — Nova senha fora da política do cadastro (8–72 caracteres, ao menos 1 letra e 1 número — CA-001-04) retorna **400** com `detalhes.nova_senha`.
- **CA-006-04** — Nova senha igual à atual retorna **400**.
- **CA-006-05** — Após a troca, **todos os tokens emitidos antes** dela passam a receber **401**; o token devolvido na resposta continua válido.
- **CA-006-06** — Requisição sem token ou com token inválido retorna **401**.
- **CA-006-07** — Após N tentativas com senha atual incorreta no intervalo (mesmo limite do login: padrão 5 / 15 min) para o mesmo usuário, retorna **429**.

## 4. Requisitos de segurança
- **RS-006-01** — A senha atual é sempre verificada com bcrypt antes da troca (impede que um token roubado sozinho tome a conta).
- **RS-006-02** — A nova senha usa a mesma política e o mesmo hash (bcrypt, custo `BCRYPT_COST`) do cadastro — RS-001-01.
- **RS-006-03** — Invalidação de sessões por **versão de token**: `users.token_versao` é incrementada na troca e gravada no JWT (claim `tv`); o `requireAuth` (que já relê o usuário no banco — ADR-04) rejeita tokens com versão diferente.
- **RS-006-04** — Rate limit por usuário nas tentativas que falham (força bruta da senha atual com token roubado).
- **RS-006-05** — Auditoria: `password_changed` (sucesso) e `password_change_failed` (senha atual errada), com `userId` e IP, **nunca** com as senhas.
- **RS-006-06** — Campos desconhecidos do body são descartados pelo zod (não é possível trocar `role`, `email` etc. por esta rota).

## 5. Ameaças (STRIDE resumido)
| Ameaça | Exemplo | Mitigação |
|---|---|---|
| Spoofing | Atacante com token roubado troca a senha e sequestra a conta | RS-006-01 (exige senha atual) |
| Spoofing | Força bruta da senha atual usando um token roubado | RS-006-04 (429), RS-006-05 (alerta no log) |
| Tampering | Enviar `role: "admin"` junto com a nova senha | RS-006-06 |
| Repudiation | "Não fui eu que troquei a senha" | RS-006-05 (log com IP e horário) |
| Info disclosure | Senha aparecer em log | Redact do pino (`senha*`) + RS-006-05 |
| Elevation | Sessão antiga continuar ativa depois de a vítima trocar a senha | RS-006-03 / CA-006-05 |

## 6. Fora de escopo
- Recuperação de senha por e-mail ("esqueci minha senha") — exigiria serviço de e-mail.
- Admin redefinir a senha de outro usuário (hoje o admin pode **desativar** o usuário — spec 005).
- Expiração periódica obrigatória de senha e histórico de senhas.
