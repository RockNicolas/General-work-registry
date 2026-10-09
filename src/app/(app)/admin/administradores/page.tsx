import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/features/auth/session";
import { ListaAdministradores } from "@/features/usuarios/components/lista-administradores";

export const metadata = { title: "Administradores — RGO" };

export default async function AdministradoresPage() {
  const ctx = await requireAdmin();

  return (
    <>
      <PageHeader
        title="Administradores"
        description="Quem entra aqui cadastra empresas, clientes, obras e categorias. A empresa contratada não tem este acesso."
      />
      <ListaAdministradores ctx={ctx} />
    </>
  );
}
