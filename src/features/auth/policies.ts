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

/** O que Empresa e Cliente consultam nas análises. */
const LEITURA_PERMITIDA: ReadonlySet<Resource> = new Set([
  "dashboard",
  "obra",
  "lancamento",
  "orcamento",
  "relatorio",
]);

/**
 * Matriz de permissões por perfil.
 * - Administrador: painel de administração (empresas, clientes, obras, categorias) e o restante.
 * - Empresa contratada: só análises, importação de Excel e integração. Não cadastra cliente, categoria nem obra.
 * - Cliente: somente as análises das obras liberadas. Sem importar, integrar ou cadastrar.
 * O recorte de QUAIS empresas/obras cada um enxerga é feito por canAccessEmpresa/canAccessObra
 * e, no banco, por RLS.
 */
export function can(ctx: Pick<AppContext, "perfil">, action: Action, resource: Resource): boolean {
  switch (ctx.perfil) {
    case "admin":
      return true;
    case "empresa":
      if (resource === "importacao") return action === "ver" || action === "importar";
      if (resource === "integracao") return action === "ver" || action === "criar" || action === "editar" || action === "excluir" || action === "sincronizar";
      if (!LEITURA_PERMITIDA.has(resource)) return false;
      return action === "ver" || (action === "exportar" && resource === "relatorio");
    case "cliente":
      if (!LEITURA_PERMITIDA.has(resource)) return false;
      return action === "ver" || (action === "exportar" && resource === "relatorio");
    default:
      return false;
  }
}

/** Empresa no papel "empresa" (não o cliente) ou o administrador. */
export function podeOperarEmpresa(ctx: Pick<AppContext, "isAdmin" | "empresaIds">, empresaId: string): boolean {
  return ctx.isAdmin || ctx.empresaIds.includes(empresaId);
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
