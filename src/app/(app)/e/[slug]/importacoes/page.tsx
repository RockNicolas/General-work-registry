import { PageHeader } from "@/components/page-header";
import { requirePode } from "@/features/auth/session";
import { empresaDaRota } from "@/features/empresas/rota";
import { ImportacoesTable } from "@/features/importacoes/components/importacoes-table";
import { UploadForm } from "@/features/importacoes/components/upload-form";
import { listarImportacoes } from "@/features/importacoes/service";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const empresa = await empresaDaRota((await params).slug);
  return { title: `Importar Excel · ${empresa.nome} — RGO` };
}

export default async function ImportacoesDaEmpresaPage({ params }: { params: Promise<{ slug: string }> }) {
  const empresa = await empresaDaRota((await params).slug);
  const ctx = await requirePode("ver", "importacao");
  const importacoes = (await listarImportacoes(ctx)).filter((i) => i.empresaId === empresa.id);

  return (
    <>
      <PageHeader
        title="Importar Excel"
        description={`${empresa.nome}. Endereço /e/${empresa.slug}/importacoes. A planilha entra só nesta empresa.`}
      />
      <UploadForm empresas={[{ id: empresa.id, nome: empresa.nome }]} />
      <section className="grid gap-3">
        <h2 className="text-lg font-medium">Histórico</h2>
        <ImportacoesTable data={importacoes} />
      </section>
    </>
  );
}
