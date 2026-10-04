-- Isolamento multi-tenant no banco (segunda barreira, além dos filtros do app).
--
-- O app conecta como dono das tabelas e, em cada requisição, entra na transação com
-- SET LOCAL ROLE rgo_app. Esse papel não é dono nem tem BYPASSRLS, então as políticas valem.
-- O contexto do usuário chega por variáveis de transação (app.*), definidas por withScope().
-- Sem contexto (variáveis ausentes), as políticas negam tudo.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rgo_app') THEN
    CREATE ROLE rgo_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;--> statement-breakpoint

-- Permite ao usuário da migração/aplicação assumir o papel (SET ROLE). Necessário no PG16+.
GRANT rgo_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO rgo_app;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.is_admin', true), '') = 'true'
$$;--> statement-breakpoint

-- Empresas em que o usuário tem papel "empresa" (enxerga a empresa inteira).
CREATE OR REPLACE FUNCTION app_empresa_ids() RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_to_array(nullif(current_setting('app.empresa_ids', true), ''), ','), ARRAY[]::text[])
$$;--> statement-breakpoint

-- Todas as empresas de que o usuário é membro (papel "empresa" ou "cliente").
CREATE OR REPLACE FUNCTION app_membro_empresa_ids() RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_to_array(nullif(current_setting('app.membro_empresa_ids', true), ''), ','), ARRAY[]::text[])
$$;--> statement-breakpoint

-- Obras liberadas individualmente (papel "cliente").
CREATE OR REPLACE FUNCTION app_obra_ids() RETURNS uuid[]
LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_to_array(nullif(current_setting('app.obra_ids', true), ''), ',')::uuid[], ARRAY[]::uuid[])
$$;--> statement-breakpoint

-- Liga o RLS numa tabela de domínio e cria as políticas. Modos:
--   obra    : tabela com empresa_id e obra_id  -> admin | empresa inteira | obra liberada
--   obra_pk : a própria tabela obra (id)       -> admin | empresa inteira | obra liberada
--   empresa : tabela só com empresa_id         -> admin | qualquer membro da empresa
--   admin   : somente administrador
-- Escrita (INSERT/UPDATE/DELETE) é sempre só do administrador.
CREATE OR REPLACE FUNCTION rgo_enable_rls(p_table regclass, p_mode text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_name text := (SELECT relname FROM pg_class WHERE oid = p_table);
  v_read text;
BEGIN
  v_read := CASE p_mode
    WHEN 'obra' THEN
      '(SELECT app_is_admin()) OR empresa_id = ANY ((SELECT app_empresa_ids())::text[]) OR obra_id = ANY ((SELECT app_obra_ids())::uuid[])'
    WHEN 'obra_pk' THEN
      '(SELECT app_is_admin()) OR empresa_id = ANY ((SELECT app_empresa_ids())::text[]) OR id = ANY ((SELECT app_obra_ids())::uuid[])'
    WHEN 'empresa' THEN
      '(SELECT app_is_admin()) OR empresa_id = ANY ((SELECT app_membro_empresa_ids())::text[])'
    WHEN 'admin' THEN
      '(SELECT app_is_admin())'
    ELSE NULL
  END;
  IF v_read IS NULL THEN
    RAISE EXCEPTION 'modo de RLS desconhecido: %', p_mode;
  END IF;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', v_name || '_leitura', p_table);
  EXECUTE format('CREATE POLICY %I ON %s FOR SELECT TO rgo_app USING (%s)', v_name || '_leitura', p_table, v_read);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', v_name || '_escrita', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR ALL TO rgo_app USING ((SELECT app_is_admin())) WITH CHECK ((SELECT app_is_admin()))',
    v_name || '_escrita', p_table
  );
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO rgo_app', p_table);
END $$;--> statement-breakpoint

SELECT rgo_enable_rls('obra', 'obra_pk');--> statement-breakpoint
SELECT rgo_enable_rls('obra_acesso', 'admin');--> statement-breakpoint

-- Empresa (organization): o app só lê as empresas do usuário.
-- Tabelas user/session/account/member/invitation não recebem nenhum GRANT: rgo_app não as acessa
-- (hash de senha e tokens ficam fora do alcance das consultas de domínio).
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON organization TO rgo_app;--> statement-breakpoint
CREATE POLICY organization_leitura ON organization FOR SELECT TO rgo_app
  USING ((SELECT app_is_admin()) OR id = ANY ((SELECT app_membro_empresa_ids())::text[]));--> statement-breakpoint
CREATE POLICY organization_escrita ON organization FOR ALL TO rgo_app
  USING ((SELECT app_is_admin())) WITH CHECK ((SELECT app_is_admin()));
