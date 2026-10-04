import { PageHeader } from "@/components/page-header";
import { requireContext } from "@/features/auth/session";
import { ObraFormDialog } from "@/features/obras/components/obra-form-dialog";
import { ObrasTable } from "@/features/obras/components/obras-table";
import { listarEmpresas } from "@/features/empresas/service";
import { listarObras } from "@/features/obras/service";

export const metadata = { title: "Obras — RGO" };

export default async function ObrasPage() {
  const ctx = await requireContext();
  const [obras, empresasAdmin] = await Promise.all([listarObras(ctx), ctx.isAdmin ? listarEmpresas(ctx) : Promise.resolve([])]);

  // Para filtro e formulário: o admin vê todas as empresas; os demais, as que aparecem nas obras.
  const empresas = ctx.isAdmin
    ? empresasAdmin.filter((e) => e.ativo).map((e) => ({ id: e.id, nome: e.nome }))
    : [...new Map(obras.map((o) => [o.empresaId, { id: o.empresaId, nome: o.empresaNome }])).values()];

  return (
    <>
      <PageHeader
        title="Obras"
        description={
          ctx.isAdmin
            ? "Todas as obras cadastradas, de todas as empresas."
            : "Obras que você tem permissão para acompanhar."
        }
        actions={ctx.isAdmin ? <ObraFormDialog empresas={empresas} /> : undefined}
      />
      <ObrasTable data={obras} empresas={empresas} isAdmin={ctx.isAdmin} />
    </>
  );
}
