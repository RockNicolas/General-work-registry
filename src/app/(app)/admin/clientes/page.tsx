import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/features/auth/session";
import { ListaGovernanca } from "@/features/usuarios/components/lista-governanca";

export const metadata = { title: "Clientes — RGO" };

export default async function ClientesPage() {
  const ctx = await requireAdmin();

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Clientes contratados entram no painel só para ver as análises das obras liberadas. Não importam planilha nem mexem na integração."
      />
      <ListaGovernanca ctx={ctx} papel="cliente" />
    </>
  );
}
