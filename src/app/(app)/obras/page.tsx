import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireContext } from "@/features/auth/session";
import { listarEmpresas } from "@/features/empresas/service";
import { urlDaEmpresa } from "@/features/empresas/url";
import { ObraFormDialog } from "@/features/obras/components/obra-form-dialog";
import { ObrasTable } from "@/features/obras/components/obras-table";
import { listarObras } from "@/features/obras/service";

export const metadata = { title: "Obras — RGO" };

export default async function ObrasPage() {
  const ctx = await requireContext();
  if (!ctx.isAdmin) {
    const minhas = (await listarEmpresas(ctx)).filter((e) => e.ativo);
    redirect(minhas.length === 1 ? urlDaEmpresa(minhas[0]!.slug) : "/dashboard");
  }
  const [obras, empresasAdmin] = await Promise.all([listarObras(ctx), listarEmpresas(ctx)]);
  const empresas = empresasAdmin.filter((e) => e.ativo).map((e) => ({ id: e.id, nome: e.nome }));

  return (
    <>
      <PageHeader
        title="Obras"
        description="Cadastro das obras. Só o administrador cria e altera. A empresa contratada acompanha os números nas análises."
        actions={<ObraFormDialog empresas={empresas} />}
      />
      <ObrasTable data={obras} empresas={empresas} isAdmin />
    </>
  );
}
