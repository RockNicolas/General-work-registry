-- A empresa (papel "empresa") passa a importar Excel e operar a integração da própria empresa.
-- O cliente continua sem essas tabelas. A confirmação da planilha grava lançamento, orçamento
-- e avanço, então a escrita desses três abre para o papel empresa. Obra, categoria e o cadastro
-- manual continuam só do administrador. A leitura da importação e da integração deixa de ser
-- exclusiva do administrador: a política FOR ALL passa a valer também no SELECT.

CREATE OR REPLACE FUNCTION rgo_empresa_escreve(p_table regclass) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_name text := (SELECT relname FROM pg_class WHERE oid = p_table);
  v_check text := '(SELECT app_is_admin()) OR empresa_id = ANY ((SELECT app_empresa_ids())::text[])';
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', v_name || '_escrita', p_table);
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR ALL TO rgo_app USING (%s) WITH CHECK (%s)',
    v_name || '_escrita', p_table, v_check, v_check
  );
END $$;--> statement-breakpoint

SELECT rgo_empresa_escreve('importacao');--> statement-breakpoint
SELECT rgo_empresa_escreve('importacao_erro');--> statement-breakpoint
SELECT rgo_empresa_escreve('integracao');--> statement-breakpoint
SELECT rgo_empresa_escreve('integracao_obra');--> statement-breakpoint
SELECT rgo_empresa_escreve('sincronizacao');--> statement-breakpoint
SELECT rgo_empresa_escreve('lancamento');--> statement-breakpoint
SELECT rgo_empresa_escreve('orcamento');--> statement-breakpoint
SELECT rgo_empresa_escreve('avanco_fisico');--> statement-breakpoint

DROP FUNCTION rgo_empresa_escreve(regclass);--> statement-breakpoint

-- Auditoria: a empresa registra o que ela mesma faz (importar, integrar), só da própria empresa.
CREATE POLICY auditoria_empresa_operacao ON auditoria FOR INSERT TO rgo_app
  WITH CHECK (
    acao IN ('criar', 'editar', 'excluir', 'importar', 'sincronizar')
    AND empresa_id = ANY ((SELECT app_empresa_ids())::text[])
  );
