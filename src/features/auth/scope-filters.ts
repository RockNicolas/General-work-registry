import { type AnyColumn, inArray, or, type SQL } from "drizzle-orm";
import type { AppContext } from "./context";

type Escopo = Pick<AppContext, "isAdmin" | "empresaIds" | "obraIds">;

/**
 * Filtro explícito de visibilidade para tabelas ligadas a obra: empresa inteira OU obra liberada.
 * Administrador não precisa de filtro (undefined). O RLS no banco repete esta regra como rede de
 * segurança; este filtro existe para a consulta dizer o que quer e não depender só da rede.
 */
export function visivelPorObra(
  ctx: Escopo,
  colunas: { empresaId: AnyColumn; obraId: AnyColumn },
): SQL | undefined {
  if (ctx.isAdmin) return undefined;
  return or(inArray(colunas.empresaId, [...ctx.empresaIds]), inArray(colunas.obraId, [...ctx.obraIds]));
}

/** Mesma regra para a própria tabela de obras (o id da obra é a coluna de obra). */
export function visivelObra(ctx: Escopo, colunas: { empresaId: AnyColumn; id: AnyColumn }): SQL | undefined {
  return visivelPorObra(ctx, { empresaId: colunas.empresaId, obraId: colunas.id });
}
