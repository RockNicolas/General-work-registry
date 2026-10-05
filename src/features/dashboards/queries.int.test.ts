import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getPool } from "@/server/db/client";
import { avancoFisico, categoria, etapa, lancamento, obra, orcamento } from "@/server/db/schema";
import { type TenantFixture, createTenantFixture } from "@/test/fixtures";
import { type FiltrosDashboard, resolverFiltros } from "./filtros";
import { carregarDashboard, opcoesDeFiltro } from "./queries";

/**
 * Números conhecidos, calculados à mão, contra Postgres real: períodos, acumulados, só operacional na
 * margem, orçamento vigente, faixas de vencimento e — principalmente — o isolamento entre empresas
 * e obras (cada perfil só soma o que enxerga).
 */
let fx: TenantFixture;
const HOJE = "2026-03-15";
const F = (extra: Record<string, unknown> = {}): FiltrosDashboard => resolverFiltros({ de: "2026-01", ate: "2026-03", ...extra }, HOJE);

let catMOD: string;
let catReceitaA: string;
let catReceitaB: string;
let etapaFundacao: string;

beforeAll(async () => {
  fx = await createTenantFixture();
  const db = getDb();
  const [A1, A2, B1] = [fx.obraId["A-1"], fx.obraId["A-2"], fx.obraId["B-1"]];
  const { empresaA, empresaB } = fx.ids;
  const cimentoA = fx.categoriaId.A;
  const cimentoB = fx.categoriaId.B;

  // O fixture traz 1 lançamento por obra; aqui o conjunto de dados é todo controlado.
  await db.delete(lancamento).where(inArray(lancamento.empresaId, [empresaA, empresaB]));
  await db.update(obra).set({ status: "ativa" }).where(eq(obra.id, A1));

  const cats = await db
    .insert(categoria)
    .values([
      { empresaId: empresaA, nome: "Pedreiro", grupo: "mao_obra_direta" },
      { empresaId: empresaA, nome: "Medição", grupo: "receita" },
      { empresaId: empresaB, nome: "Medição", grupo: "receita" },
    ])
    .returning({ id: categoria.id, empresaId: categoria.empresaId, nome: categoria.nome });
  catMOD = cats.find((c) => c.nome === "Pedreiro")!.id;
  catReceitaA = cats.find((c) => c.nome === "Medição" && c.empresaId === empresaA)!.id;
  catReceitaB = cats.find((c) => c.nome === "Medição" && c.empresaId === empresaB)!.id;

  const [fund] = await db.insert(etapa).values({ empresaId: empresaA, obraId: A1, codigo: "01", nome: "Fundação" }).returning({ id: etapa.id });
  etapaFundacao = fund!.id;

  await db.insert(orcamento).values([
    { empresaId: empresaA, obraId: A1, categoriaId: cimentoA, valorPrevistoCentavos: 500_000, versao: 2, vigente: true },
    { empresaId: empresaA, obraId: A1, categoriaId: catMOD, valorPrevistoCentavos: 300_000, versao: 2, vigente: true },
    { empresaId: empresaA, obraId: A1, categoriaId: cimentoA, valorPrevistoCentavos: 999_999, versao: 1, vigente: false }, // aposentado: não conta
    { empresaId: empresaA, obraId: A2, categoriaId: null, valorPrevistoCentavos: 200_000, versao: 1, vigente: true },
    { empresaId: empresaB, obraId: B1, categoriaId: cimentoB, valorPrevistoCentavos: 1_000_000, versao: 1, vigente: true },
  ]);

  type L = typeof lancamento.$inferInsert;
  const l = (o: Partial<L> & Pick<L, "empresaId" | "obraId" | "categoriaId" | "tipo" | "valorCentavos" | "dataCompetencia">): L => ({ situacao: "realizado", classe: "operacional", ...o });
  const A = (o: Partial<L> & Pick<L, "obraId" | "categoriaId" | "tipo" | "valorCentavos" | "dataCompetencia">) => l({ empresaId: empresaA, ...o });

  await db.insert(lancamento).values([
    // ---- A-1 ----
    A({ obraId: A1, categoriaId: cimentoA, tipo: "custo", valorCentavos: 100_000, dataCompetencia: "2026-01-10", etapaId: etapaFundacao }),
    A({ obraId: A1, categoriaId: catMOD, tipo: "custo", valorCentavos: 50_000, dataCompetencia: "2026-02-10" }),
    A({ obraId: A1, categoriaId: cimentoA, tipo: "custo", valorCentavos: 30_000, dataCompetencia: "2026-02-20", situacao: "a_realizar", dataVencimento: "2026-03-25" }),
    A({ obraId: A1, categoriaId: catMOD, tipo: "custo", valorCentavos: 20_000, dataCompetencia: "2026-03-05", situacao: "a_realizar", dataVencimento: "2026-05-10", isPrevisao: true }),
    A({ obraId: A1, categoriaId: cimentoA, tipo: "custo", valorCentavos: 7_000, dataCompetencia: "2026-03-01", situacao: "a_realizar", dataVencimento: "2026-02-01" }),
    A({ obraId: A1, categoriaId: catReceitaA, tipo: "receita", valorCentavos: 400_000, dataCompetencia: "2026-01-15" }),
    A({ obraId: A1, categoriaId: catReceitaA, tipo: "receita", valorCentavos: 150_000, dataCompetencia: "2026-03-10", situacao: "a_realizar", dataVencimento: "2026-04-20" }),
    // Aporte de sócio: movimento de caixa, NÃO é receita operacional (fora da margem).
    A({ obraId: A1, categoriaId: catReceitaA, tipo: "receita", valorCentavos: 1_000_000, dataCompetencia: "2026-02-01", classe: "aporte" }),
    // Fora da janela Jan–Mar: antes (entra só no acumulado) e depois (não entra em nada).
    A({ obraId: A1, categoriaId: cimentoA, tipo: "custo", valorCentavos: 9_999, dataCompetencia: "2025-12-31" }),
    A({ obraId: A1, categoriaId: cimentoA, tipo: "custo", valorCentavos: 8_888, dataCompetencia: "2026-04-05" }),
    // ---- A-2 ----
    A({ obraId: A2, categoriaId: cimentoA, tipo: "custo", valorCentavos: 60_000, dataCompetencia: "2026-02-15" }),
    // ---- B-1 (outra empresa) ----
    l({ empresaId: empresaB, obraId: B1, categoriaId: cimentoB, tipo: "custo", valorCentavos: 777_000, dataCompetencia: "2026-02-01" }),
    l({ empresaId: empresaB, obraId: B1, categoriaId: catReceitaB, tipo: "receita", valorCentavos: 1_500_000, dataCompetencia: "2026-02-02" }),
    l({ empresaId: empresaB, obraId: B1, categoriaId: cimentoB, tipo: "custo", valorCentavos: 5_000, dataCompetencia: "2026-02-03", situacao: "a_realizar", dataVencimento: "2026-03-20" }),
  ]);

  await db.insert(avancoFisico).values([
    // O planejado vem do Sienge (versão 1); o realizado, versão 0: a base é a menor versão planejada.
    { empresaId: empresaA, obraId: A1, competencia: "2026-01-01", tipo: "planejado", versao: 1, pctMesBps: 1000, pctAcumBps: 1000 },
    { empresaId: empresaA, obraId: A1, competencia: "2026-02-01", tipo: "planejado", versao: 1, pctMesBps: 1500, pctAcumBps: 2500 },
    { empresaId: empresaA, obraId: A1, competencia: "2026-03-01", tipo: "planejado", versao: 1, pctMesBps: 1500, pctAcumBps: 4000 },
    { empresaId: empresaA, obraId: A1, competencia: "2026-04-01", tipo: "planejado", versao: 1, pctMesBps: 1500, pctAcumBps: 5500 }, // depois do período
    { empresaId: empresaA, obraId: A1, competencia: "2026-01-01", tipo: "realizado", versao: 0, pctMesBps: 800, pctAcumBps: 800 },
    { empresaId: empresaA, obraId: A1, competencia: "2026-02-01", tipo: "realizado", versao: 0, pctMesBps: 1200, pctAcumBps: 2000 },
    { empresaId: empresaB, obraId: B1, competencia: "2026-02-01", tipo: "realizado", versao: 0, pctMesBps: 3000, pctAcumBps: 3000 },
  ]);
});

afterAll(async () => {
  await fx?.cleanup();
  await getPool().end();
});

const ver = (u: keyof TenantFixture["ctx"], f = F()) => carregarDashboard(fx.ctx[u], f, HOJE);

describe("indicadores do período (empresa A, administrador filtrando)", () => {
  it("KPIs: só operacional; aporte e fora da janela não entram; margens em bps", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA }));
    expect(d.kpis).toMatchObject({
      custoRealizado: 210_000, // 100k + 50k (A-1) + 60k (A-2); 9.999 (dez/25) e 8.888 (abr/26) ficam de fora
      custoAPagar: 57_000, // 30k + 20k + 7k
      receitaRealizada: 400_000, // o aporte de 1 milhão NÃO é receita
      receitaAReceber: 150_000,
      margemRealizada: 190_000,
      margemRealizadaBps: 4750,
      margemProjetada: 283_000, // (400k + 150k) − (210k + 57k)
      margemProjetadaBps: 5145,
      obrasTotal: 2,
      obrasAtivas: 1,
    });
  });

  it("evolução mensal: um ponto por mês, na ordem, com zeros onde não há lançamento", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA }));
    expect(d.evolucao).toEqual([
      { mes: "2026-01", receita: 400_000, custo: 100_000, aPagar: 0, aReceber: 0, margem: 300_000 },
      { mes: "2026-02", receita: 0, custo: 110_000, aPagar: 30_000, aReceber: 0, margem: -110_000 },
      { mes: "2026-03", receita: 0, custo: 0, aPagar: 27_000, aReceber: 150_000, margem: 0 },
    ]);
  });

  it("um mês só: só ele entra", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA, de: "2026-02", ate: "2026-02" }));
    expect(d.kpis.custoRealizado).toBe(110_000);
    expect(d.kpis.receitaRealizada).toBe(0);
    expect(d.evolucao).toHaveLength(1);
  });

  it("distribuição por categoria e por etapa (período), consolidando obras", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA }));
    expect(d.categorias).toEqual([
      { rotulo: "Cimento", valor: 197_000 }, // 100k + 30k + 7k (A-1) + 60k (A-2)
      { rotulo: "Pedreiro", valor: 70_000 },
    ]);
    expect(d.etapas).toEqual([
      { rotulo: "Sem etapa", valor: 167_000 },
      { rotulo: "Fundação", valor: 100_000 },
    ]);
  });

  it("fora da margem: o aporte aparece à parte", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA }));
    expect(d.foraDaMargem).toEqual([{ classe: "aporte", tipo: "receita", valor: 1_000_000 }]);
  });
});

describe("acumulado até o fim do período (orçado × comprometido × incorrido)", () => {
  it("por obra: orçamento vigente, comprometido, incorrido, desvio e margens", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA }));
    const a1 = d.obras.find((o) => o.codigo === "A-1")!;
    expect(a1).toMatchObject({
      orcado: 800_000, // 500k + 300k; a versão aposentada (999.999) não conta
      comprometido: 216_999, // inclui os 9.999 de dez/25 (acumulado) e exclui os 8.888 de abr/26
      incorrido: 159_999,
      pctComprometidoBps: 2712,
      desvio: -583_001, // abaixo do orçado
      receitaRealizada: 400_000,
      receitaTotal: 550_000,
      margemRealizada: 240_001,
      margemProjetada: 333_001,
    });
    const a2 = d.obras.find((o) => o.codigo === "A-2")!;
    expect(a2).toMatchObject({ orcado: 200_000, comprometido: 60_000, incorrido: 60_000, pctComprometidoBps: 3000, receitaRealizada: 0, margemRealizadaBps: null });
  });

  it("o fim do período move o acumulado", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA, de: "2026-01", ate: "2026-01" }));
    expect(d.obras.find((o) => o.codigo === "A-1")!.comprometido).toBe(109_999); // 100k + 9.999
  });

  it("por grupo de custo: % comprometido do orçado e peso de cada grupo no orçamento", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA }));
    const por = Object.fromEntries(d.grupos.map((g) => [g.grupo, g]));
    expect(por.material).toMatchObject({ orcado: 500_000, comprometido: 206_999, incorrido: 169_999, pctComprometidoBps: 4140, pctDoOrcadoBps: 5000 });
    expect(por.mao_obra_direta).toMatchObject({ orcado: 300_000, comprometido: 70_000, incorrido: 50_000, pctDoOrcadoBps: 3000 });
    expect(por.sem_categoria).toMatchObject({ orcado: 200_000, comprometido: 0, pctComprometidoBps: 0, pctDoOrcadoBps: 2000 });
    expect(por.receita).toBeUndefined(); // receita não é grupo de custo
    expect(d.grupos.map((g) => g.grupo)).toEqual(["material", "mao_obra_direta", "sem_categoria"]);
  });

  it("filtro por grupo restringe lançamentos e orçamento ao grupo", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA, grupo: "material" }));
    expect(d.kpis.custoRealizado).toBe(160_000); // cimento: 100k (A-1) + 60k (A-2)
    expect(d.kpis.receitaRealizada).toBe(0); // receita é outro grupo
    expect(d.obras.find((o) => o.codigo === "A-1")!.orcado).toBe(500_000);
    expect(d.obras.find((o) => o.codigo === "A-2")!.orcado).toBe(0); // orçamento sem categoria não é "material"
  });
});

describe("vencimentos (a partir de hoje)", () => {
  it("contas a pagar por faixa, separando título de previsão", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA }));
    const por = Object.fromEntries(d.aPagar.faixas.map((f) => [f.faixa, f]));
    expect(por.vencidas).toMatchObject({ efetivo: 7_000, previsao: 0 }); // venceu em 01/02, 42 dias atrás
    expect(por.ate30).toMatchObject({ efetivo: 30_000, previsao: 0 }); // 25/03: em 10 dias
    expect(por.ate60).toMatchObject({ efetivo: 0, previsao: 20_000 }); // 10/05: em 56 dias, título de previsão
    expect(d.aPagar.semVencimento).toBe(0);
  });

  it("contas a receber por faixa", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA }));
    expect(d.aReceber.faixas.find((f) => f.faixa === "ate45")).toMatchObject({ efetivo: 150_000 }); // 20/04: em 36 dias
    expect(d.aReceber.faixas.reduce((s, f) => s + f.efetivo + f.previsao, 0)).toBe(150_000);
  });

  it("independe da janela de datas escolhida", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA, de: "2026-01", ate: "2026-01" }));
    expect(d.aPagar.faixas.reduce((s, f) => s + f.efetivo + f.previsao, 0)).toBe(57_000);
  });
});

describe("avanço físico", () => {
  it("planejado (base = menor versão, aqui 1) × realizado até o mês final do período", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaA }));
    const a1 = d.avanco.find((a) => a.codigo === "A-1")!;
    expect(a1.serie.map((m) => m.competencia)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]); // abril (depois do período) fica de fora
    expect(a1.atual).toMatchObject({ competencia: "2026-02-01", planejadoAcumBps: 2500, realizadoAcumBps: 2000, desvioAcumBps: -500 });
    expect(d.avanco.find((a) => a.codigo === "A-2")).toBeUndefined(); // sem avanço informado
  });
});

describe("isolamento: cada perfil soma só o que enxerga", () => {
  it("administrador, sem filtro, vê todas as empresas (inclusive qualquer outro dado do banco)", async () => {
    const d = await ver("admin");
    // O banco de teste pode ter outros dados (e2e, seed): o consolidado é no mínimo o das duas empresas desta fixture.
    expect(d.kpis.custoRealizado).toBeGreaterThanOrEqual(210_000 + 777_000);
    expect(d.kpis.receitaRealizada).toBeGreaterThanOrEqual(400_000 + 1_500_000);
    const ids = d.obras.map((o) => o.id);
    for (const id of fx.todasObras) expect(ids).toContain(id);
  });

  it("administrador filtrando a empresa B vê só a B", async () => {
    const d = await ver("admin", F({ empresa: fx.ids.empresaB }));
    expect(d.kpis).toMatchObject({ custoRealizado: 777_000, custoAPagar: 5_000, receitaRealizada: 1_500_000 });
    expect(d.obras.map((o) => o.codigo)).toEqual(["B-1"]);
    expect(d.avanco.map((a) => a.codigo)).toEqual(["B-1"]);
  });

  it("usuário da empresa A, sem filtro, nunca soma a B", async () => {
    const d = await ver("empresaA");
    expect(d.kpis.custoRealizado).toBe(210_000);
    expect(d.kpis.receitaRealizada).toBe(400_000);
    expect(d.obras.map((o) => o.codigo).sort()).toEqual(["A-1", "A-2"]);
    expect(d.avanco.map((a) => a.codigo)).toEqual(["A-1"]);
    expect(d.categorias.some((c) => c.valor === 777_000)).toBe(false);
  });

  it("usuário da empresa A pedindo a empresa B (ou a obra B-1) pela URL: nada", async () => {
    for (const f of [F({ empresa: fx.ids.empresaB }), F({ obra: fx.obraId["B-1"] })]) {
      const d = await ver("empresaA", f);
      expect(d.kpis).toMatchObject({ custoRealizado: 0, custoAPagar: 0, receitaRealizada: 0, receitaAReceber: 0, obrasTotal: 0 });
      expect(d.obras).toEqual([]);
      expect(d.avanco).toEqual([]);
      expect(d.categorias).toEqual([]);
      expect(d.grupos).toEqual([]);
      expect(d.aPagar.faixas.every((x) => x.efetivo === 0 && x.previsao === 0)).toBe(true);
    }
  });

  it("cliente da empresa A, liberado só na obra A-1: soma só a A-1", async () => {
    const d = await ver("clienteA");
    expect(d.kpis.custoRealizado).toBe(150_000);
    expect(d.kpis.obrasTotal).toBe(1);
    expect(d.obras.map((o) => o.codigo)).toEqual(["A-1"]);
    expect(d.grupos.find((g) => g.grupo === "sem_categoria")).toBeUndefined(); // o orçamento sem categoria é da A-2
  });

  it("cliente pedindo a obra A-2 (da mesma empresa, não liberada): nada", async () => {
    const d = await ver("clienteA", F({ obra: fx.obraId["A-2"] }));
    expect(d.kpis.custoRealizado).toBe(0);
    expect(d.obras).toEqual([]);
  });

  it("usuário sem vínculo não vê nada", async () => {
    const d = await ver("semVinculo");
    expect(d.kpis).toMatchObject({ custoRealizado: 0, receitaRealizada: 0, obrasTotal: 0 });
    expect(d.obras).toEqual([]);
    expect(d.evolucao.every((p) => p.receita === 0 && p.custo === 0)).toBe(true);
  });

  it("as opções de filtro só trazem obras e empresas visíveis", async () => {
    const todos = await opcoesDeFiltro(fx.ctx.admin);
    expect(todos.obras.filter((o) => fx.todasObras.includes(o.id))).toHaveLength(3);

    const emp = await opcoesDeFiltro(fx.ctx.empresaA);
    expect(emp.obras.map((o) => o.codigo).sort()).toEqual(["A-1", "A-2"]);
    expect(emp.empresas.map((e) => e.id)).toEqual([fx.ids.empresaA]);

    const cli = await opcoesDeFiltro(fx.ctx.clienteA);
    expect(cli.obras.map((o) => o.codigo)).toEqual(["A-1"]);

    expect((await opcoesDeFiltro(fx.ctx.semVinculo)).obras).toEqual([]);
  });
});

describe("empresa sem dados", () => {
  it("devolve zeros e listas vazias em vez de falhar", async () => {
    const d = await ver("admin", F({ empresa: "empresa-que-nao-existe" }));
    expect(d.kpis).toMatchObject({ custoRealizado: 0, margemRealizadaBps: null, margemProjetadaBps: null, obrasTotal: 0 });
    expect(d.evolucao).toHaveLength(3);
    expect(d.obras).toEqual([]);
    expect(d.foraDaMargem).toEqual([]);
  });
});
