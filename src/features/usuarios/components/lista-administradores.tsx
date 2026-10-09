import type { AppContext } from "@/features/auth/context";
import { listarUsuarios } from "@/features/auth/usuarios-admin";
import { UsuarioFormDialog } from "./usuario-form-dialog";
import { UsuariosTable } from "./usuarios-table";

/** Cadastro de outros administradores. Eles enxergam o painel inteiro, sem vínculo com empresa. */
export async function ListaAdministradores({ ctx }: { ctx: AppContext }) {
  const usuarios = await listarUsuarios();
  const data = usuarios.filter((u) => u.admin);

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <UsuarioFormDialog empresas={[]} obrasPorEmpresa={{}} meuId={ctx.userId} somenteAdmin />
      </div>
      <UsuariosTable data={data} empresas={[]} obrasPorEmpresa={{}} meuId={ctx.userId} somenteAdmin />
    </div>
  );
}
