import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireContext } from "@/features/auth/session";
import { empresaDaRota } from "@/features/empresas/rota";
import { urlDaEmpresa } from "@/features/empresas/url";
import { ObraFormDialog } from "@/features/obras/components/obra-form-dialog";
import { ObrasTable } from "@/features/obras/components/obras-table";
import { listarObras } from "@/features/obras/service";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const empresa = await empresaDaRota((await params).slug);
  return { title: `Obras · ${empresa.nome} — RGO` };
}

export default async function ObrasDaEmpresaPage({ params }: { params: Promise<{ slug: string }> }) {
  const empresa = await empresaDaRota((await params).slug);
  const ctx = await requireContext();
  if (!ctx.isAdmin) redirect(urlDaEmpresa(empresa.slug));
  const obras = (await listarObras(ctx)).filter((o) => o.empresaId === empresa.id);
  const opcao = [{ id: empresa.id, nome: empresa.nome }];

  return (
    <>
      <PageHeader
        title="Obras"
        description={`${empresa.nome}. Endereço /e/${empresa.slug}/obras.`}
        actions={ctx.isAdmin ? <ObraFormDialog empresas={opcao} /> : undefined}
      />
      <ObrasTable data={obras} empresas={opcao} isAdmin={ctx.isAdmin} />
    </>
  );
}
