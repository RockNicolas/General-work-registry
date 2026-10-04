import type { AppContext } from "./context";

export type Action = "ver" | "criar" | "editar" | "excluir" | "importar" | "sincronizar" | "exportar";

export type Resource =
  | "dashboard"
  | "obra"
  | "lancamento"
  | "orcamento"
  | "relatorio"
  | "empresa"
  | "usuario"
  | "importacao"
  | "integracao"
  | "auditoria";

/** Recursos que Empresa e Cliente podem consultar (somente leitura). */
const LEITURA_PERMITIDA: ReadonlySet<Resource> = new Set([
  "dashboard",
  "obra",
  "lancamento",
  "orcamento",
  "relatorio",
]);

/**
 * Matriz de permissões por perfil.
 * - Administrador: tudo.
 * - Empresa e Cliente: somente leitura de dashboards/obras/lançamentos/orçamento e exportação
 *   de relatórios. Nunca gerenciam empresas, usuários, importações, integrações ou auditoria.
 * O recorte de QUAIS empresas/obras cada um enxerga é feito por canAccessEmpresa/canAccessObra
 * e, no banco, por RLS.
 */
export function can(ctx: Pick<AppContext, "perfil">, action: Action, resource: Resource): boolean {
  switch (ctx.perfil) {
    case "admin":
      return true;
    case "empresa":
    case "cliente":
      if (!LEITURA_PERMITIDA.has(resource)) return false;
      return action === "ver" || (action === "exportar" && resource === "relatorio");
    default:
      return false;
  }
}

export function canAccessEmpresa(
  ctx: Pick<AppContext, "isAdmin" | "membroEmpresaIds">,
  empresaId: string,
): boolean {
  return ctx.isAdmin || ctx.membroEmpresaIds.includes(empresaId);
}

export function canAccessObra(
  ctx: Pick<AppContext, "isAdmin" | "empresaIds" | "obraIds">,
  obra: { id: string; empresaId: string },
): boolean {
  return ctx.isAdmin || ctx.empresaIds.includes(obra.empresaId) || ctx.obraIds.includes(obra.id);
}
