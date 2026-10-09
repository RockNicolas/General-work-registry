-- Exportações (Excel/PDF) também são auditadas, e Empresa/Cliente podem exportar os próprios dados.
-- Até aqui só o administrador podia inserir em auditoria. Esta política (somada à de administrador,
-- que continua valendo) deixa QUALQUER usuário registrar apenas eventos de exportação, e só
-- em nome de empresa de que seja membro (ou sem empresa). Leitura segue exclusiva do administrador;
-- a tabela continua append-only (o papel do app não tem UPDATE/DELETE).
CREATE POLICY auditoria_exportacao ON auditoria FOR INSERT TO rgo_app
  WITH CHECK (
    acao = 'exportar'
    AND (empresa_id IS NULL OR empresa_id = ANY ((SELECT app_membro_empresa_ids())::text[]))
  );
