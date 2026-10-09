import type { AppContext } from "@/features/auth/context";
import { listarUsuarios } from "@/features/auth/usuarios-admin";
import { listarEmpresas } from "@/features/empresas/service";
import { listarObras } from "@/features/obras/service";
import type { PapelVinculo } from "../schema";
import { UsuarioFormDialog } from "./usuario-form-dialog";
import { UsuariosTable } from "./usuarios-table";

/** Cadastro de quem entra no painel: acesso da empresa ou cliente. */
export async function ListaGovernanca({ ctx, papel }: { ctx: AppContext; papel: PapelVinculo }) {
  const [usuarios, todasEmpresas, obras] = await Promise.all([listarUsuarios(), listarEmpresas(ctx), listarObras(ctx)]);
  const empresas = todasEmpresas.filter((e) => e.ativo).map((e) => ({ id: e.id, nome: e.nome }));
  const obrasPorEmpresa: Record<string, { id: string; codigo: string; nome: string }[]> = {};
  for (const o of obras) (obrasPorEmpresa[o.empresaId] ??= []).push({ id: o.id, codigo: o.codigo, nome: o.nome });
  const data = usuarios.filter((u) => !u.admin && u.vinculos.some((v) => v.papel === papel));

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <UsuarioFormDialog empresas={empresas} obrasPorEmpresa={obrasPorEmpresa} meuId={ctx.userId} papelFixo={papel} />
      </div>
      <UsuariosTable data={data} empresas={empresas} obrasPorEmpresa={obrasPorEmpresa} meuId={ctx.userId} papelFixo={papel} />
    </div>
  );
}
