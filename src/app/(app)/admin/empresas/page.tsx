import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/features/auth/session";
import { EmpresaFormDialog } from "@/features/empresas/components/empresa-form-dialog";
import { EmpresasTable } from "@/features/empresas/components/empresas-table";
import { listarEmpresas } from "@/features/empresas/service";

export const metadata = { title: "Empresas — RGO" };

export default async function EmpresasPage() {
  const ctx = await requireAdmin();
  const empresas = await listarEmpresas(ctx);

  return (
    <>
      <PageHeader
        title="Empresas"
        description="Empresas clientes do sistema. Cada uma enxerga apenas as próprias obras e dashboards."
        actions={<EmpresaFormDialog />}
      />
      <EmpresasTable data={empresas} />
    </>
  );
}
