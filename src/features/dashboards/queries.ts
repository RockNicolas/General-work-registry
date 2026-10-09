import { type SQL, and, asc, count, eq, gte, lte, sql } from "drizzle-orm";
import type { AppContext } from "@/features/auth/context";
import { visivelObra, visivelPorObra } from "@/features/auth/scope-filters";
import { type ComparativoMes, compararAvanco } from "@/features/avanco/comparativo";
import { CATEGORIA_GRUPOS, type CategoriaGrupo, type LancamentoClasse, type ObraStatus } from "@/lib/domain";
import { avancoFisico, categoria, etapa, lancamento, obra, orcamento, organization } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { type FatiaRotulada, margemBps, preencherMeses, razaoBps, topComDemais } from "./calculos";
import { type Vencimentos, agruparPorFaixa } from "./faixas";
import type { FiltrosDashboard } from "./filtros";
import { diasEntre, mesesEntre, primeiroDiaDoMes, ultimoDiaDoMes } from "./periodo";

/**
 * Dashboards: consolidação financeira e de avanço, para o que o usuário PODE ver.
 *
 * Isolamento: toda consulta passa por `withScope` (RLS) E repete o filtro de visibilidade na própria
 * consulta (`visivelPorObra`/`visivelObra`) mais os filtros de empresa/obra escolhidos na tela. Um
 * `empresa`/`obra` da URL que o usuário não enxerga simplesmente não retorna linhas.
 *
 * Métricas (ver calculos.ts): só `classe = operacional` entra em custo, receita e margem; aportes,
 * adiantamentos e devoluções a sócios aparecem à parte ("fora da margem").
 *   - Resultado do período (KPIs, evolução, distribuição): competência de `de` a `ate`.
 *   - Acumulado (orçado × comprometido, grupos, avanço): competência até o fim de `ate`.
 *   - Vencimentos: o que está a realizar, a partir de hoje (independe do período).
 */

type Tx = Parameters<Parameters<typeof withScope>[1]>[0];

// ---------- Tipos do resultado (todos serializáveis: vão da página para componentes client) ----------

export type Kpis = {
  receitaRealizada: number;
  receitaAReceber: number;
  custoRealizado: number;
  custoAPagar: number;
  margemRealizada: number;
  margemRealizadaBps: number | null;
  /** (receita realizada + a receber) − (custo realizado + a pagar). */
  margemProjetada: number;
  margemProjetadaBps: number | null;
  obrasAtivas: number;
  obrasTotal: number;
};

export type PontoEvolucao = { mes: string; receita: number; custo: number; aPagar: number; aReceber: number; margem: number };

export type LinhaObra = {
  id: string;
  codigo: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  status: ObraStatus;
  orcado: number;
  comprometido: number;
  incorrido: number;
  /** Comprometido ÷ orçado, em bps (pode passar de 10000). null sem orçamento. */
  pctComprometidoBps: number | null;
  /** Comprometido − orçado: positivo = acima do orçado. */
  desvio: number;
  desvioBps: number | null;
  receitaRealizada: number;
  receitaTotal: number;
  margemRealizada: number;
  margemRealizadaBps: number | null;
  margemProjetada: number;
  margemProjetadaBps: number | null;
};

export type GrupoCusto = "sem_categoria" | CategoriaGrupo;
export type LinhaGrupo = { grupo: GrupoCusto; orcado: number; comprometido: number; incorrido: number; pctComprometidoBps: number | null; pctDoOrcadoBps: number | null };

export type AvancoObra = {
  obraId: string;
  codigo: string;
  nome: string;
  serie: ComparativoMes[];
  /** O último mês com avanço realizado informado (com o planejado do mesmo mês), ou null. */
  atual: ComparativoMes | null;
};

export type ForaDaMargem = { classe: Exclude<LancamentoClasse, "operacional">; tipo: "custo" | "receita"; valor: number };

export type DashboardDados = {
  filtros: FiltrosDashboard;
  hoje: string;
  kpis: Kpis;
  evolucao: PontoEvolucao[];
  obras: LinhaObra[];
  grupos: LinhaGrupo[];
  categorias: FatiaRotulada[];
  etapas: FatiaRotulada[];
  avanco: AvancoObra[];
  aPagar: Vencimentos;
  aReceber: Vencimentos;
  foraDaMargem: ForaDaMargem[];
};

// ---------- Blocos de SQL ----------

const CUSTO = sql`${lancamento.tipo} = 'custo'`;
const RECEITA = sql`${lancamento.tipo} = 'receita'`;
const REALIZADO = sql`${lancamento.situacao} = 'realizado'`;
const A_REALIZAR = sql`${lancamento.situacao} = 'a_realizar'`;

const todas = (...c: SQL[]): SQL => sql`(${sql.join(c, sql` and `)})`;
const somaSe = (cond: SQL) => sql<string>`coalesce(sum(${lancamento.valorCentavos}) filter (where ${cond}), 0)::bigint`;
const n = (v: string | number | null | undefined): number => Number(v ?? 0);

/** Lançamentos operacionais visíveis, já com os filtros da tela e (opcional) a janela de competência. */
function lancamentosVisiveis(ctx: AppContext, f: FiltrosDashboard, janela: { de?: string; ate: string } | null) {
  return and(
    visivelPorObra(ctx, { empresaId: lancamento.empresaId, obraId: lancamento.obraId }),
    f.empresaId ? eq(lancamento.empresaId, f.empresaId) : undefined,
    f.obraId ? eq(lancamento.obraId, f.obraId) : undefined,
    f.grupo ? eq(categoria.grupo, f.grupo) : undefined,
    sql`${lancamento.classe} = 'operacional'`,
    janela?.de ? gte(lancamento.dataCompetencia, janela.de) : undefined,
    janela ? lte(lancamento.dataCompetencia, janela.ate) : undefined,
  );
}

const periodoDe = (f: FiltrosDashboard) => ({ de: primeiroDiaDoMes(f.de), ate: ultimoDiaDoMes(f.ate) });
const acumuladoAte = (f: FiltrosDashboard) => ({ ate: ultimoDiaDoMes(f.ate) });

// ---------- Consultas (todas sequenciais, na mesma transação) ----------

async function kpisDoPeriodo(tx: Tx, ctx: AppContext, f: FiltrosDashboard): Promise<Omit<Kpis, "obrasAtivas" | "obrasTotal">> {
  const [r] = await tx
    .select({
      receitaRealizada: somaSe(todas(RECEITA, REALIZADO)),
      receitaAReceber: somaSe(todas(RECEITA, A_REALIZAR)),
      custoRealizado: somaSe(todas(CUSTO, REALIZADO)),
      custoAPagar: somaSe(todas(CUSTO, A_REALIZAR)),
    })
    .from(lancamento)
    .innerJoin(categoria, eq(categoria.id, lancamento.categoriaId))
    .where(lancamentosVisiveis(ctx, f, periodoDe(f)));

  const receitaRealizada = n(r?.receitaRealizada);
  const receitaAReceber = n(r?.receitaAReceber);
  const custoRealizado = n(r?.custoRealizado);
  const custoAPagar = n(r?.custoAPagar);
  return {
    receitaRealizada,
    receitaAReceber,
    custoRealizado,
    custoAPagar,
    margemRealizada: receitaRealizada - custoRealizado,
    margemRealizadaBps: margemBps(receitaRealizada, custoRealizado),
    margemProjetada: receitaRealizada + receitaAReceber - (custoRealizado + custoAPagar),
    margemProjetadaBps: margemBps(receitaRealizada + receitaAReceber, custoRealizado + custoAPagar),
  };
}

async function contarObras(tx: Tx, ctx: AppContext, f: FiltrosDashboard) {
  const [r] = await tx
    .select({ total: count(), ativas: sql<string>`count(*) filter (where ${obra.status} = 'ativa')` })
    .from(obra)
    .where(and(visivelObra(ctx, obra), f.empresaId ? eq(obra.empresaId, f.empresaId) : undefined, f.obraId ? eq(obra.id, f.obraId) : undefined));
  return { obrasTotal: r?.total ?? 0, obrasAtivas: n(r?.ativas) };
}

async function evolucaoMensal(tx: Tx, ctx: AppContext, f: FiltrosDashboard): Promise<PontoEvolucao[]> {
  const mes = sql<string>`to_char(${lancamento.dataCompetencia}, 'YYYY-MM')`;
  const linhas = await tx
    .select({
      mes,
      receita: somaSe(todas(RECEITA, REALIZADO)),
      aReceber: somaSe(todas(RECEITA, A_REALIZAR)),
      custo: somaSe(todas(CUSTO, REALIZADO)),
      aPagar: somaSe(todas(CUSTO, A_REALIZAR)),
    })
    .from(lancamento)
    .innerJoin(categoria, eq(categoria.id, lancamento.categoriaId))
    .where(lancamentosVisiveis(ctx, f, periodoDe(f)))
    .groupBy(mes);

  return preencherMeses(
    mesesEntre(f.de, f.ate),
    linhas.map((l) => ({ mes: l.mes, receita: n(l.receita), custo: n(l.custo), aPagar: n(l.aPagar), aReceber: n(l.aReceber) })),
  );
}

async function comparativoObras(tx: Tx, ctx: AppContext, f: FiltrosDashboard): Promise<LinhaObra[]> {
  const obras = await tx
    .select({ id: obra.id, codigo: obra.codigo, nome: obra.nome, status: obra.status, empresaId: obra.empresaId, empresaNome: organization.name })
    .from(obra)
    .innerJoin(organization, eq(organization.id, obra.empresaId))
    .where(and(visivelObra(ctx, obra), f.empresaId ? eq(obra.empresaId, f.empresaId) : undefined, f.obraId ? eq(obra.id, f.obraId) : undefined))
    .orderBy(asc(organization.name), asc(obra.codigo));

  const orcado = await tx
    .select({ obraId: orcamento.obraId, total: sql<string>`coalesce(sum(${orcamento.valorPrevistoCentavos}), 0)::bigint` })
    .from(orcamento)
    .leftJoin(categoria, eq(categoria.id, orcamento.categoriaId))
    .where(
      and(
        eq(orcamento.vigente, true),
        visivelPorObra(ctx, { empresaId: orcamento.empresaId, obraId: orcamento.obraId }),
        f.empresaId ? eq(orcamento.empresaId, f.empresaId) : undefined,
        f.obraId ? eq(orcamento.obraId, f.obraId) : undefined,
        f.grupo ? eq(categoria.grupo, f.grupo) : undefined,
      ),
    )
    .groupBy(orcamento.obraId);

  const realizado = await tx
    .select({
      obraId: lancamento.obraId,
      comprometido: somaSe(CUSTO),
      incorrido: somaSe(todas(CUSTO, REALIZADO)),
      receitaRealizada: somaSe(todas(RECEITA, REALIZADO)),
      receitaTotal: somaSe(RECEITA),
    })
    .from(lancamento)
    .innerJoin(categoria, eq(categoria.id, lancamento.categoriaId))
    .where(lancamentosVisiveis(ctx, f, acumuladoAte(f)))
    .groupBy(lancamento.obraId);

  const orcadoPorObra = new Map(orcado.map((o) => [o.obraId, n(o.total)]));
  const realizadoPorObra = new Map(realizado.map((r) => [r.obraId, r]));

  return obras.map((o) => {
    const r = realizadoPorObra.get(o.id);
    const orc = orcadoPorObra.get(o.id) ?? 0;
    const comprometido = n(r?.comprometido);
    const incorrido = n(r?.incorrido);
    const receitaRealizada = n(r?.receitaRealizada);
    const receitaTotal = n(r?.receitaTotal);
    return {
      ...o,
      orcado: orc,
      comprometido,
      incorrido,
      pctComprometidoBps: razaoBps(comprometido, orc),
      desvio: comprometido - orc,
      desvioBps: razaoBps(comprometido - orc, orc),
      receitaRealizada,
      receitaTotal,
      margemRealizada: receitaRealizada - incorrido,
      margemRealizadaBps: margemBps(receitaRealizada, incorrido),
      margemProjetada: receitaTotal - comprometido,
      margemProjetadaBps: margemBps(receitaTotal, comprometido),
    };
  });
}

async function gruposDeCusto(tx: Tx, ctx: AppContext, f: FiltrosDashboard): Promise<LinhaGrupo[]> {
  const orcado = await tx
    .select({ grupo: sql<string>`coalesce(${categoria.grupo}::text, 'sem_categoria')`, total: sql<string>`coalesce(sum(${orcamento.valorPrevistoCentavos}), 0)::bigint` })
    .from(orcamento)
    .leftJoin(categoria, eq(categoria.id, orcamento.categoriaId))
    .where(
      and(
        eq(orcamento.vigente, true),
        visivelPorObra(ctx, { empresaId: orcamento.empresaId, obraId: orcamento.obraId }),
        f.empresaId ? eq(orcamento.empresaId, f.empresaId) : undefined,
        f.obraId ? eq(orcamento.obraId, f.obraId) : undefined,
        f.grupo ? eq(categoria.grupo, f.grupo) : undefined,
      ),
    )
    .groupBy(sql`coalesce(${categoria.grupo}::text, 'sem_categoria')`);

  const gasto = await tx
    .select({ grupo: sql<string>`${categoria.grupo}::text`, comprometido: somaSe(CUSTO), incorrido: somaSe(todas(CUSTO, REALIZADO)) })
    .from(lancamento)
    .innerJoin(categoria, eq(categoria.id, lancamento.categoriaId))
    .where(lancamentosVisiveis(ctx, f, acumuladoAte(f)))
    .groupBy(categoria.grupo);

  const orcadoPorGrupo = new Map(orcado.map((o) => [o.grupo, n(o.total)]));
  const gastoPorGrupo = new Map(gasto.map((g) => [g.grupo, g]));
  const ordem: GrupoCusto[] = [...CATEGORIA_GRUPOS.filter((g) => g !== "receita"), "sem_categoria"];
  const orcadoTotal = [...orcadoPorGrupo.values()].reduce((s, v) => s + v, 0);

  return ordem
    .map((grupo) => {
      const orc = orcadoPorGrupo.get(grupo) ?? 0;
      const comprometido = n(gastoPorGrupo.get(grupo)?.comprometido);
      const incorrido = n(gastoPorGrupo.get(grupo)?.incorrido);
      return { grupo, orcado: orc, comprometido, incorrido, pctComprometidoBps: razaoBps(comprometido, orc), pctDoOrcadoBps: razaoBps(orc, orcadoTotal) };
    })
    .filter((g) => g.orcado !== 0 || g.comprometido !== 0 || g.incorrido !== 0);
}

async function distribuicao(tx: Tx, ctx: AppContext, f: FiltrosDashboard, por: "categoria" | "etapa"): Promise<FatiaRotulada[]> {
  // Categorias e etapas de empresas/obras diferentes com o mesmo nome somam juntas (visão consolidada).
  const rotulo = por === "categoria" ? sql<string>`${categoria.nome}` : sql<string>`coalesce(${etapa.nome}, 'Sem etapa')`;
  const base = tx
    .select({ rotulo, valor: somaSe(CUSTO) })
    .from(lancamento)
    .innerJoin(categoria, eq(categoria.id, lancamento.categoriaId));
  const comEtapa = por === "etapa" ? base.leftJoin(etapa, eq(etapa.id, lancamento.etapaId)) : base;
  const linhas = await comEtapa.where(lancamentosVisiveis(ctx, f, periodoDe(f))).groupBy(rotulo);
  return topComDemais(
    linhas.map((l) => ({ rotulo: l.rotulo, valor: n(l.valor) })),
    9,
  );
}

async function linhasDeAvanco(tx: Tx, ctx: AppContext, f: FiltrosDashboard) {
  return tx
    .select({
      obraId: avancoFisico.obraId,
      competencia: avancoFisico.competencia,
      tipo: avancoFisico.tipo,
      versao: avancoFisico.versao,
      pctMesBps: avancoFisico.pctMesBps,
      pctAcumBps: avancoFisico.pctAcumBps,
    })
    .from(avancoFisico)
    .where(
      and(
        visivelPorObra(ctx, { empresaId: avancoFisico.empresaId, obraId: avancoFisico.obraId }),
        f.empresaId ? eq(avancoFisico.empresaId, f.empresaId) : undefined,
        f.obraId ? eq(avancoFisico.obraId, f.obraId) : undefined,
        lte(avancoFisico.competencia, primeiroDiaDoMes(f.ate)),
      ),
    );
}

function montarAvanco(obras: LinhaObra[], linhas: Awaited<ReturnType<typeof linhasDeAvanco>>): AvancoObra[] {
  const porObra = new Map<string, typeof linhas>();
  for (const l of linhas) porObra.set(l.obraId, [...(porObra.get(l.obraId) ?? []), l]);

  const resultado: AvancoObra[] = [];
  for (const o of obras) {
    const doObra = porObra.get(o.id);
    if (!doObra) continue;
    const serie = compararAvanco(doObra);
    const atual = [...serie].reverse().find((m) => m.realizadoAcumBps !== null) ?? null;
    resultado.push({ obraId: o.id, codigo: o.codigo, nome: o.nome, serie, atual });
  }
  return resultado;
}

async function vencimentos(tx: Tx, ctx: AppContext, f: FiltrosDashboard, hoje: string): Promise<{ aPagar: Vencimentos; aReceber: Vencimentos }> {
  // Agrupa pela data de vencimento (poucas datas distintas) e distribui nas faixas em TypeScript:
  // a regra das faixas fica num só lugar (faixas.ts), testada, e o SQL não depende de parâmetros repetidos.
  const linhas = await tx
    .select({
      tipo: lancamento.tipo,
      isPrevisao: lancamento.isPrevisao,
      vencimento: lancamento.dataVencimento,
      valor: sql<string>`coalesce(sum(${lancamento.valorCentavos}), 0)::bigint`,
    })
    .from(lancamento)
    .innerJoin(categoria, eq(categoria.id, lancamento.categoriaId))
    .where(and(lancamentosVisiveis(ctx, f, null), A_REALIZAR))
    .groupBy(lancamento.tipo, lancamento.isPrevisao, lancamento.dataVencimento);

  const itens = (tipo: "custo" | "receita") =>
    linhas
      .filter((l) => l.tipo === tipo)
      .map((l) => ({ dias: l.vencimento ? diasEntre(hoje, l.vencimento) : null, isPrevisao: l.isPrevisao, valor: n(l.valor) }));
  return { aPagar: agruparPorFaixa(itens("custo")), aReceber: agruparPorFaixa(itens("receita")) };
}

async function foraDaMargem(tx: Tx, ctx: AppContext, f: FiltrosDashboard): Promise<ForaDaMargem[]> {
  const p = periodoDe(f);
  const linhas = await tx
    .select({ classe: lancamento.classe, tipo: lancamento.tipo, valor: somaSe(REALIZADO) })
    .from(lancamento)
    .innerJoin(categoria, eq(categoria.id, lancamento.categoriaId))
    .where(
      and(
        visivelPorObra(ctx, { empresaId: lancamento.empresaId, obraId: lancamento.obraId }),
        f.empresaId ? eq(lancamento.empresaId, f.empresaId) : undefined,
        f.obraId ? eq(lancamento.obraId, f.obraId) : undefined,
        f.grupo ? eq(categoria.grupo, f.grupo) : undefined,
        sql`${lancamento.classe} <> 'operacional'`,
        gte(lancamento.dataCompetencia, p.de),
        lte(lancamento.dataCompetencia, p.ate),
      ),
    )
    .groupBy(lancamento.classe, lancamento.tipo);
  return linhas
    .map((l) => ({ classe: l.classe as ForaDaMargem["classe"], tipo: l.tipo, valor: n(l.valor) }))
    .filter((l) => l.valor !== 0);
}

/**
 * Tudo que o painel mostra. Cada consulta abre o próprio escopo e elas rodam juntas: no banco remoto,
 * dez consultas em fila somam vários segundos; em paralelo o tempo é o da mais lenta.
 */
export async function carregarDashboard(ctx: AppContext, filtros: FiltrosDashboard, hoje: string): Promise<DashboardDados> {
  const buscar = <T>(fn: (tx: Tx) => Promise<T>) => withScope(ctx, fn);
  const [kpisPeriodo, contagem, evolucao, obras, grupos, categorias, etapas, linhasAvanco, venc, fora] = await Promise.all([
    buscar((tx) => kpisDoPeriodo(tx, ctx, filtros)),
    buscar((tx) => contarObras(tx, ctx, filtros)),
    buscar((tx) => evolucaoMensal(tx, ctx, filtros)),
    buscar((tx) => comparativoObras(tx, ctx, filtros)),
    buscar((tx) => gruposDeCusto(tx, ctx, filtros)),
    buscar((tx) => distribuicao(tx, ctx, filtros, "categoria")),
    buscar((tx) => distribuicao(tx, ctx, filtros, "etapa")),
    buscar((tx) => linhasDeAvanco(tx, ctx, filtros)),
    buscar((tx) => vencimentos(tx, ctx, filtros, hoje)),
    buscar((tx) => foraDaMargem(tx, ctx, filtros)),
  ]);

  return {
    filtros,
    hoje,
    kpis: { ...kpisPeriodo, ...contagem },
    evolucao,
    obras,
    grupos,
    categorias,
    etapas,
    avanco: montarAvanco(obras, linhasAvanco),
    aPagar: venc.aPagar,
    aReceber: venc.aReceber,
    foraDaMargem: fora,
  };
}

/** Opções dos filtros: só as obras (e, por elas, as empresas) que o usuário enxerga. */
export async function opcoesDeFiltro(ctx: AppContext) {
  const obras = await withScope(ctx, (tx) =>
    tx
      .select({ id: obra.id, codigo: obra.codigo, nome: obra.nome, empresaId: obra.empresaId, empresaNome: organization.name })
      .from(obra)
      .innerJoin(organization, eq(organization.id, obra.empresaId))
      .where(visivelObra(ctx, obra))
      .orderBy(asc(organization.name), asc(obra.codigo)),
  );
  const empresas = [...new Map(obras.map((o) => [o.empresaId, { id: o.empresaId, nome: o.empresaNome }])).values()];
  return { empresas, obras };
}
