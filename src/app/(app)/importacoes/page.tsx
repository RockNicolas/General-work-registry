import { PageHeader } from "@/components/page-header";
import { requirePode } from "@/features/auth/session";
import { listarEmpresas } from "@/features/empresas/service";
import { ImportacoesTable } from "@/features/importacoes/components/importacoes-table";
import { UploadForm } from "@/features/importacoes/components/upload-form";
import { listarImportacoes } from "@/features/importacoes/service";

export const metadata = { title: "Importações — RGO" };

export default async function ImportacoesPage() {
  const ctx = await requirePode("ver", "importacao");
  const [importacoes, empresas] = await Promise.all([listarImportacoes(ctx), listarEmpresas(ctx)]);

  return (
    <>
      <PageHeader
        title="Importações"
        description="Envie planilhas de lançamentos, orçamento e avanço físico no modelo padrão. Antes de gravar, você confere uma prévia e os erros por linha."
      />
      <UploadForm empresas={empresas.filter((e) => e.ativo).map((e) => ({ id: e.id, nome: e.nome }))} />
      <section className="grid gap-3">
        <h2 className="text-lg font-medium">Histórico</h2>
        <ImportacoesTable data={importacoes} />
      </section>
    </>
  );
}
