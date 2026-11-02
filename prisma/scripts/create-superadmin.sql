-- Cria o primeiro superadmin ou liga a marca num usuário que já existe (spec 005 RF13).
-- Roda fora da aplicação (não gera auditoria); email e nome entram como parâmetros, nunca
-- versionados. Idempotente: rodar de novo com o mesmo email deixa um só usuário.
--
--   psql "$DATABASE_URL" -v email='voce@example.com' -v name='Seu Nome' \
--     -f casaria-api/prisma/scripts/create-superadmin.sql
--
-- Depois, entre no painel com a conta Google desse email (ou peça um link de redefinição).

\set ON_ERROR_STOP on

INSERT INTO users (email, name, is_superadmin, updated_at)
VALUES (lower(btrim(:'email')), btrim(:'name'), true, now())
ON CONFLICT (email) DO UPDATE
  SET is_superadmin = true,
      updated_at = now();

SELECT id, email, name, is_superadmin
  FROM users
 WHERE email = lower(btrim(:'email'));
