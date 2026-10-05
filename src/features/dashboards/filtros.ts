import { z } from "zod";
import { CATEGORIA_GRUPOS, type CategoriaGrupo } from "@/lib/domain";
import { type Mes, adicionarMeses, mesDe, mesValido, mesesEntre } from "./periodo";

/** Janela padrão (meses, contando o atual) e o máximo aceito: evita consultas e gráficos enormes. */
export const MESES_PADRAO = 12;
export const MESES_MAXIMO = 60;

const mes = z.string().refine(mesValido);

/** Filtros vindos da URL. Valor inválido é descartado (nunca quebra a página). */
export const filtrosDashboardSchema = z.object({
  empresa: z.string().trim().min(1).max(120).optional().catch(undefined),
  obra: z.uuid().optional().catch(undefined),
  grupo: z.enum(CATEGORIA_GRUPOS).optional().catch(undefined),
  de: mes.optional().catch(undefined),
  ate: mes.optional().catch(undefined),
});

export type FiltrosDashboard = {
  empresaId?: string;
  obraId?: string;
  grupo?: CategoriaGrupo;
  /** Janela do resultado do período e da evolução mensal. */
  de: Mes;
  /** Fim do período; também é a data-limite dos acumulados (orçado × comprometido, avanço). */
  ate: Mes;
};

/**
 * Normaliza os parâmetros da URL: padrão = últimos 12 meses terminando no mês de `hoje`;
 * datas invertidas são trocadas; janelas acima de 60 meses são encurtadas pelo início.
 */
export function resolverFiltros(bruto: unknown, hoje: string): FiltrosDashboard {
  const p = filtrosDashboardSchema.parse(bruto ?? {});
  let ate = p.ate ?? mesDe(hoje);
  let de = p.de ?? adicionarMeses(ate, -(MESES_PADRAO - 1));
  if (de > ate) [de, ate] = [ate, de];
  if (mesesEntre(de, ate).length > MESES_MAXIMO) de = adicionarMeses(ate, -(MESES_MAXIMO - 1));
  return { empresaId: p.empresa, obraId: p.obra, grupo: p.grupo, de, ate };
}

/** Parâmetros de URL equivalentes (para links de exportação, paginação etc.). Só o que foi escolhido. */
export function filtrosParaParams(f: FiltrosDashboard): Record<string, string> {
  const params: Record<string, string> = { de: f.de, ate: f.ate };
  if (f.empresaId) params.empresa = f.empresaId;
  if (f.obraId) params.obra = f.obraId;
  if (f.grupo) params.grupo = f.grupo;
  return params;
}
