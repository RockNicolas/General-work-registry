import { describe, expect, it } from "vitest";
import { margemBps, preencherMeses, razaoBps, topComDemais } from "./calculos";

describe("razaoBps", () => {
  it("calcula em pontos-base, arredondando", () => {
    expect(razaoBps(1, 4)).toBe(2500);
    expect(razaoBps(1, 3)).toBe(3333);
    expect(razaoBps(2, 3)).toBe(6667);
    expect(razaoBps(150, 100)).toBe(15000); // pode passar de 100% (estourou o orçado)
    expect(razaoBps(-25, 100)).toBe(-2500);
  });

  it("sem base não há percentual", () => {
    expect(razaoBps(10, 0)).toBeNull();
    expect(razaoBps(10, -5)).toBeNull();
    expect(razaoBps(0, 0)).toBeNull();
  });

  it("é inteiro mesmo com valores grandes (R$ 900 milhões)", () => {
    const r = razaoBps(37_000_000_000, 90_000_000_000);
    expect(Number.isSafeInteger(r)).toBe(true);
    expect(r).toBe(4111);
  });
});

describe("margemBps", () => {
  it("margem sobre a receita", () => {
    expect(margemBps(1000, 800)).toBe(2000);
    expect(margemBps(1000, 1000)).toBe(0);
    expect(margemBps(1000, 1200)).toBe(-2000);
  });
  it("sem receita, sem margem percentual", () => {
    expect(margemBps(0, 500)).toBeNull();
  });
});

describe("topComDemais", () => {
  const f = (rotulo: string, valor: number) => ({ rotulo, valor });

  it("ordena por valor, do maior para o menor", () => {
    expect(topComDemais([f("a", 1), f("b", 3), f("c", 2)], 5).map((x) => x.rotulo)).toEqual(["b", "c", "a"]);
  });

  it("junta o que passa do limite em 'Demais' sem perder valor", () => {
    const entrada = [f("a", 50), f("b", 40), f("c", 30), f("d", 20), f("e", 10)];
    const r = topComDemais(entrada, 3);
    expect(r).toEqual([f("a", 50), f("b", 40), f("c", 30), f("Demais", 30)]);
    expect(r.reduce((s, x) => s + x.valor, 0)).toBe(150);
  });

  it("não cria 'Demais' quando cabe tudo, e ignora zeros e negativos", () => {
    expect(topComDemais([f("a", 5), f("b", 0), f("c", -3)], 2)).toEqual([f("a", 5)]);
    expect(topComDemais([], 3)).toEqual([]);
  });

  it("empate no valor ordena por nome (resultado estável)", () => {
    expect(topComDemais([f("zeta", 10), f("alfa", 10), f("Beta", 10)], 5).map((x) => x.rotulo)).toEqual(["alfa", "Beta", "zeta"]);
  });
});

describe("preencherMeses", () => {
  it("devolve todos os meses, na ordem, zerando os que não têm lançamentos", () => {
    const r = preencherMeses(["2026-01", "2026-02", "2026-03"], [{ mes: "2026-03", receita: 1000, custo: 400, aPagar: 50, aReceber: 70 }, { mes: "2026-01", receita: 10, custo: 20, aPagar: 0, aReceber: 0 }]);
    expect(r.map((p) => p.mes)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(r[1]).toEqual({ mes: "2026-02", receita: 0, custo: 0, aPagar: 0, aReceber: 0, margem: 0 });
    expect(r[0]!.margem).toBe(-10);
    expect(r[2]!.margem).toBe(600);
  });

  it("ignora pontos fora do intervalo pedido", () => {
    const r = preencherMeses(["2026-02"], [{ mes: "2025-12", receita: 999, custo: 0, aPagar: 0, aReceber: 0 }]);
    expect(r).toHaveLength(1);
    expect(r[0]!.receita).toBe(0);
  });
});
