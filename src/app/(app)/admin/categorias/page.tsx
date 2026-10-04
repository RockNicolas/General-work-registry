import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/features/auth/session";
import { CategoriaFormDialog, CategoriasPadraoDialog } from "@/features/categorias/components/categoria-form-dialog";
import { CategoriasTable } from "@/features/categorias/components/categorias-table";
import { listarCategorias } from "@/features/categorias/service";
import { listarEmpresas } from "@/features/empresas/service";

export const metadata = { title: "Categorias — RGO" };

export default async function CategoriasPage() {
  const ctx = await requireAdmin();
  const [categorias, todasEmpresas] = await Promise.all([listarCategorias(ctx), listarEmpresas(ctx)]);
  const empresas = todasEmpresas.map((e) => ({ id: e.id, nome: e.nome }));

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Classificação de custos e receitas, por empresa. O grupo alimenta os indicadores por tipo de custo."
        actions={
          <>
            <CategoriasPadraoDialog empresas={empresas} />
            <CategoriaFormDialog empresas={empresas} />
          </>
        }
      />
      <CategoriasTable data={categorias} empresas={empresas} />
    </>
  );
}
