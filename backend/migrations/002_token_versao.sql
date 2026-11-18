-- Spec 006 / RS-006-03 — Versão do token: incrementada na troca de senha para
-- invalidar todos os JWT emitidos antes dela. 0 = valor dos tokens antigos (sem claim "tv").
ALTER TABLE users ADD COLUMN token_versao INTEGER NOT NULL DEFAULT 0 CHECK (token_versao >= 0);
