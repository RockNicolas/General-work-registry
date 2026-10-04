-- RLS das tabelas de domínio (helper rgo_enable_rls: ver 0002_rls_tenant.sql).

-- Ligadas a uma obra: admin | empresa inteira | obra liberada ao cliente.
SELECT rgo_enable_rls('etapa', 'obra');--> statement-breakpoint
SELECT rgo_enable_rls('orcamento', 'obra');--> statement-breakpoint
SELECT rgo_enable_rls('lancamento', 'obra');--> statement-breakpoint
SELECT rgo_enable_rls('avanco_fisico', 'obra');--> statement-breakpoint

-- Por empresa: qualquer membro (empresa ou cliente) lê, para poder rotular lançamentos.
SELECT rgo_enable_rls('categoria', 'empresa');--> statement-breakpoint

-- Somente administrador (credenciais, sincronizações, importações).
SELECT rgo_enable_rls('integracao', 'admin');--> statement-breakpoint
SELECT rgo_enable_rls('integracao_obra', 'admin');--> statement-breakpoint
SELECT rgo_enable_rls('sincronizacao', 'admin');--> statement-breakpoint
SELECT rgo_enable_rls('importacao', 'admin');--> statement-breakpoint
SELECT rgo_enable_rls('importacao_erro', 'admin');--> statement-breakpoint

-- Auditoria: append-only. O app só insere e lê; nunca altera nem apaga.
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON auditoria TO rgo_app;--> statement-breakpoint
CREATE POLICY auditoria_leitura ON auditoria FOR SELECT TO rgo_app
  USING ((SELECT app_is_admin()));--> statement-breakpoint
CREATE POLICY auditoria_insercao ON auditoria FOR INSERT TO rgo_app
  WITH CHECK ((SELECT app_is_admin()));
