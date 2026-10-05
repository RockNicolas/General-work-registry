import { describe, expect, it } from "vitest";
import {
  avancoDaObra,
  grupoDoInsumo,
  orcamentoDosItens,
  paraCentavos,
  parcelaPagarParaLancamentos,
  parcelaReceberParaLancamentos,
  ratear,
  serieDeAvanco,
} from "./mappers";
import { itemOrcamentoSchema, parcelaPagarSchema, parcelaReceberSchema } from "./schemas";

describe("paraCentavos", () => {
  it("arredonda sem erro de ponto flutuante", () => {
    expect(paraCentavos(1234.56)).toBe(123456);
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
    expect(paraCentavos(19.99)).toBe(1999);
    expect(paraCentavos(-5.5)).toBe(-550);
    expect(paraCentavos(null)).toBe(0);
    expect(paraCentavos(undefined)).toBe(0);
    expect(paraCentavos(Number.NaN)).toBe(0);
  });
});

describe("ratear", () => {
  it("a soma das partes é sempre exatamente o total (maior resto)", () => {
    expect(ratear(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(ratear(1, [1, 1])).toEqual([1, 0]);
    expect(ratear(1000, [60, 40])).toEqual([600, 400]);
    expect(ratear(0, [1, 2])).toEqual([0, 0]);
  });

  it("propriedade: para totais e pesos aleatórios a soma bate e nada fica negativo", () => {
    let semente = 12345;
    const aleatorio = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 500; i++) {
      const total = Math.floor(aleatorio() * 10_000_000);
      const pesos = Array.from({ length: 1 + Math.floor(aleatorio() * 6) }, () => Math.round(aleatorio() * 10000) / 100);
      const partes = ratear(total, pesos);
      expect(partes.reduce((a, b) => a + b, 0)).toBe(total);
      expect(partes.every((p) => p >= 0)).toBe(true);
    }
  });

  it("valores negativos mantêm o sinal e a soma", () => {
    const partes = ratear(-100, [1, 1, 1]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(-100);
    expect(partes.every((p) => p <= 0)).toBe(true);
  });

  it("pesos zerados dividem por igual; lista vazia dá lista vazia", () => {
    expect(ratear(10, [0, 0])).toEqual([5, 5]);
    expect(ratear(10, [])).toEqual([]);
  });

  it("peso zero em meio a outros recebe zero", () => {
    expect(ratear(100, [0, 50, 50])).toEqual([0, 50, 50]);
  });
});

// Exemplo no formato do bulk-data /outcome (campos do OpenAPI do Sienge).
const parcelaPagar = (extra: Record<string, unknown> = {}) =>
  parcelaPagarSchema.parse({
    companyId: 1,
    billId: 5001,
    installmentId: 9001,
    creditorName: "Cimento Forte Ltda",
    documentIdentificationId: "NF",
    documentNumber: "1234",
    forecastDocument: null,
    originalAmount: 10000,
    balanceAmount: 4000,
    dueDate: "2026-03-20",
    issueDate: "2026-03-05",
    billDate: "2026-03-01",
    paymentsCategories: [
      { costCenterId: 101, financialCategoryId: "2.01.01", financialCategoryName: "Materiais de construção", financialCategoryRate: 60 },
      { costCenterId: 102, financialCategoryId: "2.01.01", financialCategoryName: "Materiais de construção", financialCategoryRate: 40 },
    ],
    buildingsCosts: [{ buildingId: 101, rate: 60 }, { buildingId: 102, rate: 40 }],
    payments: [{ sequencialNumber: 1, grossAmount: 6000, netAmount: 5900, paymentDate: "2026-03-18" }],
    ...extra,
  });

describe("parcelaPagarParaLancamentos", () => {
  it("separa o pago (realizado) do saldo (a realizar) e rateia entre as obras", () => {
    const { itens, avisos } = parcelaPagarParaLancamentos(parcelaPagar());
    expect(avisos).toEqual([]);
    expect(itens).toHaveLength(4); // 2 obras × (1 baixa + saldo)

    const por = (obra: string, situacao: string) => itens.find((i) => i.obraOrigemId === obra && i.situacao === situacao)!;
    expect(por("101", "realizado")).toMatchObject({ valorCentavos: 354_000, dataLiquidacao: "2026-03-18", dataCompetencia: "2026-03-01", tipo: "custo" });
    expect(por("102", "realizado").valorCentavos).toBe(236_000);
    expect(por("101", "a_realizar")).toMatchObject({ valorCentavos: 240_000, dataVencimento: "2026-03-20", dataLiquidacao: null });
    expect(por("102", "a_realizar").valorCentavos).toBe(160_000);

    // Realizado + saldo = valor líquido pago + saldo.
    expect(itens.reduce((s, i) => s + i.valorCentavos, 0)).toBe(590_000 + 400_000);
  });

  it("usa o valor bruto quando configurado", () => {
    const { itens } = parcelaPagarParaLancamentos(parcelaPagar(), { valorPagamento: "bruto" });
    const realizado = itens.filter((i) => i.situacao === "realizado").reduce((s, i) => s + i.valorCentavos, 0);
    expect(realizado).toBe(600_000);
  });

  it("os ids de origem são estáveis e únicos", () => {
    const { itens } = parcelaPagarParaLancamentos(parcelaPagar());
    const ids = itens.map((i) => i.idOrigem);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("out:9001:p1:101:2.01.01");
    expect(ids).toContain("out:9001:saldo:102:2.01.01");
    expect(new Set(itens.map((i) => i.grupoOrigem))).toEqual(new Set(["out:9001"]));
    // Mesma parcela, mesmo resultado.
    expect(parcelaPagarParaLancamentos(parcelaPagar()).itens.map((i) => i.idOrigem)).toEqual(ids);
  });

  it("parcela totalmente paga não gera saldo; sem pagamento vira só saldo", () => {
    const paga = parcelaPagarParaLancamentos(parcelaPagar({ balanceAmount: 0, payments: [{ sequencialNumber: 1, netAmount: 10000, grossAmount: 10000, paymentDate: "2026-03-10" }] }));
    expect(paga.itens.every((i) => i.situacao === "realizado")).toBe(true);

    const aberta = parcelaPagarParaLancamentos(parcelaPagar({ balanceAmount: 10000, payments: [] }));
    expect(aberta.itens.every((i) => i.situacao === "a_realizar")).toBe(true);
    expect(aberta.itens.reduce((s, i) => s + i.valorCentavos, 0)).toBe(1_000_000);
  });

  it("documento de previsão marca só o saldo como previsão", () => {
    const { itens } = parcelaPagarParaLancamentos(parcelaPagar({ forecastDocument: "PREV-77" }));
    expect(itens.filter((i) => i.situacao === "a_realizar").every((i) => i.isPrevisao)).toBe(true);
    expect(itens.filter((i) => i.situacao === "realizado").every((i) => !i.isPrevisao)).toBe(true);
    expect(parcelaPagarParaLancamentos(parcelaPagar()).itens.some((i) => i.isPrevisao)).toBe(false);
  });

  it("sinaliza parcela sem apropriação ao orçamento da obra (distorção)", () => {
    expect(parcelaPagarParaLancamentos(parcelaPagar()).itens.every((i) => !i.semApropriacaoOrcamento)).toBe(true);
    expect(parcelaPagarParaLancamentos(parcelaPagar({ buildingsCosts: [] })).itens.every((i) => i.semApropriacaoOrcamento)).toBe(true);
    expect(parcelaPagarParaLancamentos(parcelaPagar({ buildingsCosts: null })).itens.every((i) => i.semApropriacaoOrcamento)).toBe(true);
  });

  it("somas repetidas do mesmo centro de custo/plano são agrupadas", () => {
    const { itens } = parcelaPagarParaLancamentos(
      parcelaPagar({
        payments: [],
        balanceAmount: 1000,
        paymentsCategories: [
          { costCenterId: 101, financialCategoryId: "A", financialCategoryName: "A", financialCategoryRate: 30 },
          { costCenterId: 101, financialCategoryId: "A", financialCategoryName: "A", financialCategoryRate: 70 },
        ],
      }),
    );
    expect(itens).toHaveLength(1);
    expect(itens[0]!.valorCentavos).toBe(100_000);
  });

  it("ignora (com aviso) parcela sem apropriação financeira ou sem data", () => {
    const sem = parcelaPagarParaLancamentos(parcelaPagar({ paymentsCategories: [] }));
    expect(sem.itens).toEqual([]);
    expect(sem.avisos[0]).toMatch(/sem apropriação a centro de custo/);

    const semData = parcelaPagarParaLancamentos(parcelaPagar({ billDate: null, issueDate: null, dueDate: null }));
    expect(semData.itens).toEqual([]);
    expect(semData.avisos[0]).toMatch(/sem data/);
  });

  it("competência cai para a emissão e depois para o vencimento", () => {
    expect(parcelaPagarParaLancamentos(parcelaPagar({ billDate: null })).itens[0]!.dataCompetencia).toBe("2026-03-05");
    expect(parcelaPagarParaLancamentos(parcelaPagar({ billDate: null, issueDate: null })).itens[0]!.dataCompetencia).toBe("2026-03-20");
  });

  it("plano financeiro ausente cai numa categoria 'Sem plano financeiro'", () => {
    const { itens } = parcelaPagarParaLancamentos(
      parcelaPagar({ payments: [], paymentsCategories: [{ costCenterId: 101, financialCategoryRate: 100 }] }),
    );
    expect(itens[0]!.categoria).toEqual({ codigo: "SEM-PLANO", nome: "Sem plano financeiro" });
  });

  it("monta contraparte, documento e pista de classificação", () => {
    const { itens } = parcelaPagarParaLancamentos(parcelaPagar({ payments: [{ sequencialNumber: 1, netAmount: 100, paymentDate: "2026-03-18", operationTypeName: "Devolução de sócio" }] }));
    const pago = itens.find((i) => i.situacao === "realizado")!;
    expect(pago).toMatchObject({ contraparte: "Cimento Forte Ltda", documento: "NF 1234" });
    expect(pago.pistaClasse).toContain("Devolução de sócio");
  });
});

const parcelaReceber = (extra: Record<string, unknown> = {}) =>
  parcelaReceberSchema.parse({
    billId: 7001,
    installmentId: 8001,
    clientName: "Condomínio Sol",
    documentIdentificationId: "MED",
    documentNumber: "12",
    documentForecast: "N",
    originalAmount: 50000,
    balanceAmount: 20000,
    dueDate: "2026-04-10",
    billDate: "2026-03-31",
    receiptsCategories: [{ costCenterId: 101, financialCategoryId: "1.01", financialCategoryName: "Medições", financialCategoryRate: 100 }],
    receipts: [{ operationTypeName: "Recebimento", grossAmount: 30000, netAmount: 29500, paymentDate: "2026-04-05" }],
    ...extra,
  });

describe("parcelaReceberParaLancamentos", () => {
  it("recibo vira receita realizada e saldo vira receita a realizar", () => {
    const { itens } = parcelaReceberParaLancamentos(parcelaReceber());
    expect(itens).toHaveLength(2);
    expect(itens.find((i) => i.situacao === "realizado")).toMatchObject({ tipo: "receita", valorCentavos: 2_950_000, dataLiquidacao: "2026-04-05", contraparte: "Condomínio Sol", obraOrigemId: "101" });
    expect(itens.find((i) => i.situacao === "a_realizar")).toMatchObject({ valorCentavos: 2_000_000, dataVencimento: "2026-04-10", isPrevisao: false });
    expect(itens.map((i) => i.idOrigem).every((id) => id.startsWith("inc:8001:"))).toBe(true);
    expect(itens.every((i) => i.semApropriacaoOrcamento === false)).toBe(true);
  });

  it("documentForecast = S marca a previsão no saldo", () => {
    const { itens } = parcelaReceberParaLancamentos(parcelaReceber({ documentForecast: "S" }));
    expect(itens.find((i) => i.situacao === "a_realizar")!.isPrevisao).toBe(true);
    expect(itens.find((i) => i.situacao === "realizado")!.isPrevisao).toBe(false);
  });
});

describe("orçamento", () => {
  const item = (extra: Record<string, unknown>) =>
    itemOrcamentoSchema.parse({ buildingId: 101, versionNumber: 2, ...extra });

  const itens = [
    // agrupadores (dão nome às etapas)
    item({ wbsCode: "01", workItemId: null, description: "Serviços preliminares", totalPrice: 999999 }),
    item({ wbsCode: "02", workItemId: null, description: "Fundação", totalPrice: 999999 }),
    item({ wbsCode: "02.01", workItemId: null, description: "Estacas", totalPrice: 999999 }),
    // folhas
    item({ wbsCode: "01.001", workItemId: 1, description: "Canteiro", totalPrice: 1000, pricesByCategory: [{ category: "LABOR", totalPrice: 600 }, { category: "MATERIAL", totalPrice: 400 }] }),
    item({ wbsCode: "02.01.001", workItemId: 2, description: "Estaca", totalPrice: 5000, pricesByCategory: [{ category: "MATERIAL", totalPrice: 3000 }, { category: "EQUIPMENT", totalPrice: 2000 }] }),
    item({ wbsCode: "02.01.002", workItemId: 3, description: "Estaca 2", totalPrice: 1000, pricesByCategory: [{ category: "MATERIAL", totalPrice: 1000 }] }),
    item({ wbsCode: "02.02.001", workItemId: 4, description: "Sem tipo", totalPrice: 700, pricesByCategory: [] }),
    // versão antiga: ignorada
    item({ versionNumber: 1, wbsCode: "01.001", workItemId: 1, totalPrice: 123456, pricesByCategory: [{ category: "MATERIAL", totalPrice: 123456 }] }),
  ];

  it("soma só folhas da versão vigente por etapa × grupo, com nomes das etapas", () => {
    const linhas = orcamentoDosItens(itens);
    const achar = (etapa: string, grupo: string) => linhas.find((l) => l.etapa?.codigo === etapa && l.grupo === grupo);

    expect(achar("01", "mao_obra_direta")).toMatchObject({ valorCentavos: 60_000, versao: 2, obraOrigemId: "101", idOrigem: "bud:101:v2:01:mao_obra_direta" });
    expect(achar("01", "material")!.valorCentavos).toBe(40_000);
    expect(achar("02", "material")!.valorCentavos).toBe(400_000); // 3000 + 1000 de duas folhas
    expect(achar("02", "maquinas_equipamentos")!.valorCentavos).toBe(200_000);
    expect(achar("02", "outros")!.valorCentavos).toBe(70_000); // folha sem tipo de insumo
    expect(achar("01", "material")!.etapa).toEqual({ codigo: "01", nome: "Serviços preliminares" });
    expect(achar("02", "material")!.etapa!.nome).toBe("Fundação");

    // Total = soma das folhas da versão vigente (agrupadores e versão antiga não entram).
    expect(linhas.reduce((s, l) => s + l.valorCentavos, 0)).toBe((1000 + 5000 + 1000 + 700) * 100);
  });

  it("ids estáveis e únicos; objeto de erro da API é ignorado", () => {
    const ids = orcamentoDosItens([...itens, item({ "api-error": "falha no servidor" })]).map((l) => l.idOrigem);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mapeia os tipos de insumo para grupos de custo", () => {
    expect(grupoDoInsumo("MATERIAL")).toBe("material");
    expect(grupoDoInsumo("material")).toBe("material");
    expect(grupoDoInsumo("EQUIPMENT")).toBe("maquinas_equipamentos");
    expect(grupoDoInsumo("LABOR")).toBe("mao_obra_direta");
    expect(grupoDoInsumo("TRANSPORT_ITEM")).toBe("servicos");
    expect(grupoDoInsumo("QUALQUER_COISA")).toBe("outros");
    expect(grupoDoInsumo(null)).toBe("outros");
  });
});

describe("avanço físico", () => {
  const f = (totalPrice: number, plan: number | null, real: number | null) =>
    itemOrcamentoSchema.parse({ buildingId: 1, versionNumber: 1, workItemId: 1, wbsCode: "01.001", totalPrice, scheduledPercentComplete: plan, percentComplete: real });

  it("pondera pelo valor orçado dos itens-folha (escala 0–100)", () => {
    // 1000 a 50%/40% e 3000 a 100%/80% → (500+3000)/4000 = 87,5% planejado; (400+2400)/4000 = 70% realizado
    const r = avancoDaObra([f(1000, 50, 40), f(3000, 100, 80)])!;
    expect(r.planejado).toBeCloseTo(0.875, 10);
    expect(r.realizado).toBeCloseTo(0.7, 10);
  });

  it("item sem ligação com o planejamento conta 0% (denominador é o orçamento todo)", () => {
    const r = avancoDaObra([f(1000, 100, 100), f(1000, null, null)])!;
    expect(r.planejado).toBeCloseTo(0.5, 10);
  });

  it("escala 0–1 e proteção contra passar de 100%", () => {
    expect(avancoDaObra([f(1000, 0.25, 0.1)], "0-1")!.planejado).toBeCloseTo(0.25, 10);
    expect(avancoDaObra([f(1000, 250, 250)], "0-100")!.realizado).toBe(1);
  });

  it("sem orçamento não há avanço", () => {
    expect(avancoDaObra([])).toBeNull();
  });

  it("série mensal: 'no mês' é a diferença dos acumulados; planejado do ERP é versão 1", () => {
    const serie = serieDeAvanco("101", [
      { competencia: "2026-02-01", planejado: 0.2, realizado: 0.15 },
      { competencia: "2026-01-01", planejado: 0.1, realizado: 0.1 },
    ]);
    expect(serie.filter((s) => s.tipo === "realizado").map((s) => [s.competencia, s.pctMesBps, s.pctAcumBps])).toEqual([
      ["2026-01-01", 1000, 1000],
      ["2026-02-01", 500, 1500],
    ]);
    expect(serie.filter((s) => s.tipo === "planejado").every((s) => s.versao === 1)).toBe(true);
    expect(serie.filter((s) => s.tipo === "realizado").every((s) => s.versao === 0)).toBe(true);
  });

  it("nunca produz 'no mês' negativo (ajuste para baixo no ERP)", () => {
    const serie = serieDeAvanco("1", [
      { competencia: "2026-01-01", planejado: 0.3, realizado: 0.3 },
      { competencia: "2026-02-01", planejado: 0.3, realizado: 0.25 },
    ]);
    expect(serie.every((s) => s.pctMesBps >= 0)).toBe(true);
  });
});
