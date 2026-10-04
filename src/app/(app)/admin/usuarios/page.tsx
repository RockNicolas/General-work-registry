import { PageHeader } from "@/components/page-header";
import { listarUsuarios } from "@/features/auth/usuarios-admin";
import { requireAdmin } from "@/features/auth/session";
import { listarEmpresas } from "@/features/empresas/service";
import { listarObras } from "@/features/obras/service";
import { UsuarioFormDialog } from "@/features/usuarios/components/usuario-form-dialog";
import { UsuariosTable } from "@/features/usuarios/components/usuarios-table";

export const metadata = { title: "Usuários — RGO" };

export default async function UsuariosPage() {
  const ctx = await requireAdmin();
  const [usuarios, todasEmpresas, obras] = await Promise.all([listarUsuarios(), listarEmpresas(ctx), listarObras(ctx)]);

  const empresas = todasEmpresas.filter((e) => e.ativo).map((e) => ({ id: e.id, nome: e.nome }));
  const obrasPorEmpresa: Record<string, { id: string; codigo: string; nome: string }[]> = {};
  for (const o of obras) (obrasPorEmpresa[o.empresaId] ??= []).push({ id: o.id, codigo: o.codigo, nome: o.nome });

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Administradores veem tudo. Usuários de empresa e clientes têm acesso somente leitura, limitado às suas empresas e obras."
        actions={<UsuarioFormDialog empresas={empresas} obrasPorEmpresa={obrasPorEmpresa} meuId={ctx.userId} />}
      />
      <UsuariosTable data={usuarios} empresas={empresas} obrasPorEmpresa={obrasPorEmpresa} meuId={ctx.userId} />
    </>
  );
}
