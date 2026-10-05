/**
 * Cálculos puros dos indicadores. Valores em centavos (inteiros), percentuais em pontos-base.
 *
 * Definições (valem em todo o sistema; só lançamentos de classe "operacional" entram):
 * - Incorrido = custo realizado (pago).
 * - Comprometido = custo realizado + custo a realizar (pago + a pagar).
 * - Margem realizada = receita realizada − custo realizado.
 * - Margem projetada = (receita realizada + a receber) − custo comprometido.
 * - Desvio do orçamento = comprometido − orçado (positivo = acima do orçado).
 */

/** Razão em pontos-base, arredondada. null quando a base é zero (ou negativa): não há percentual. */
export function razaoBps(parte: number, base: number): number | null {
  if (!(base > 0)) return null;
  return Math.round((parte / base) * 10_000);
}

/** Margem sobre a receita, em pontos-base; null sem receita. */
export const margemBps = (receita: number, custo: number): number | null => razaoBps(receita - custo, receita);

export type FatiaRotulada = { rotulo: string; valor: number };

/**
 * Mantém as `max` maiores fatias (por valor) e junta o resto em "Demais". Fatias de valor
 * zero ou negativo ficam de fora (um gráfico de distribuição só mostra o que pesa).
 */
export function topComDemais(fatias: FatiaRotulada[], max: number): FatiaRotulada[] {
  const positivas = fatias.filter((f) => f.valor > 0).sort((a, b) => b.valor - a.valor || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  if (positivas.length <= max) return positivas;
  const topo = positivas.slice(0, max);
  const demais = positivas.slice(max).reduce((s, f) => s + f.valor, 0);
  return [...topo, { rotulo: "Demais", valor: demais }];
}

export type PontoMensal = { mes: string; receita: number; custo: number; aPagar: number; aReceber: number };

/** Garante um ponto para cada mês do intervalo (zerado quando não há lançamentos), em ordem. */
export function preencherMeses(meses: string[], pontos: PontoMensal[]): (PontoMensal & { margem: number })[] {
  const porMes = new Map(pontos.map((p) => [p.mes, p]));
  return meses.map((mes) => {
    const p = porMes.get(mes) ?? { mes, receita: 0, custo: 0, aPagar: 0, aReceber: 0 };
    return { ...p, margem: p.receita - p.custo };
  });
}
