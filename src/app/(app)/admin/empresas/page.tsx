import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/features/auth/session";
import { EmpresaFormDialog } from "@/features/empresas/components/empresa-form-dialog";
import { EmpresasTable } from "@/features/empresas/components/empresas-table";
import { listarEmpresas } from "@/features/empresas/service";
import { ListaGovernanca } from "@/features/usuarios/components/lista-governanca";

export const metadata = { title: "Empresas — RGO" };

export default async function EmpresasPage() {
  const ctx = await requireAdmin();
  const empresas = await listarEmpresas(ctx);

  return (
    <>
      <PageHeader
        title="Empresas"
        description="Cadastre as empresas que entram no painel. Cada uma vê as próprias análises, importa Excel e usa a integração do ERP."
        actions={<EmpresaFormDialog />}
      />
      <EmpresasTable data={empresas} />
      <section className="grid gap-3">
        <div className="grid gap-1">
          <h2 className="text-lg font-medium">Acessos ao painel</h2>
          <p className="text-sm text-muted-foreground">
            Quem entra com este acesso vê as análises da empresa e pode importar Excel e usar a integração.
          </p>
        </div>
        <ListaGovernanca ctx={ctx} papel="empresa" />
      </section>
    </>
  );
}
