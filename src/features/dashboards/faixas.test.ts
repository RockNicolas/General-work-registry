import { describe, expect, it } from "vitest";
import { FAIXAS_VENCIMENTO, agruparPorFaixa, faixaDe } from "./faixas";

describe("faixaDe", () => {
  it.each([
    [-400, "vencidas"],
    [-1, "vencidas"],
    [0, "ate30"], // vence hoje
    [30, "ate30"],
    [31, "ate45"],
    [45, "ate45"],
    [46, "ate60"],
    [60, "ate60"],
    [61, "ate90"],
    [90, "ate90"],
    [91, "ate120"],
    [120, "ate120"],
    [121, "mais120"],
    [9999, "mais120"],
  ])("%i dias → %s", (dias, faixa) => {
    expect(faixaDe(dias)).toBe(faixa);
  });

  it("toda a reta numérica cai numa faixa, e as faixas só avançam", () => {
    let anterior = -1;
    for (let d = -500; d <= 500; d++) {
      const i = FAIXAS_VENCIMENTO.findIndex((f) => f.id === faixaDe(d));
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeGreaterThanOrEqual(anterior);
      anterior = i;
    }
  });
});

describe("agruparPorFaixa", () => {
  it("devolve todas as faixas, zeradas, mesmo sem itens", () => {
    const r = agruparPorFaixa([]);
    expect(r.faixas).toHaveLength(FAIXAS_VENCIMENTO.length);
    expect(r.faixas.every((f) => f.previsao === 0 && f.efetivo === 0)).toBe(true);
    expect(r.semVencimento).toBe(0);
  });

  it("separa com e sem título de previsão e soma dentro da faixa", () => {
    const r = agruparPorFaixa([
      { dias: 10, isPrevisao: false, valor: 1000 },
      { dias: 20, isPrevisao: false, valor: 500 },
      { dias: 25, isPrevisao: true, valor: 300 },
      { dias: 100, isPrevisao: true, valor: 700 },
      { dias: -5, isPrevisao: false, valor: 40 },
    ]);
    const por = Object.fromEntries(r.faixas.map((f) => [f.faixa, f]));
    expect(por.ate30).toMatchObject({ efetivo: 1500, previsao: 300 });
    expect(por.ate120).toMatchObject({ efetivo: 0, previsao: 700 });
    expect(por.vencidas).toMatchObject({ efetivo: 40, previsao: 0 });
  });

  it("sem data de vencimento fica de fora das faixas, mas não se perde", () => {
    const r = agruparPorFaixa([
      { dias: null, isPrevisao: false, valor: 900 },
      { dias: null, isPrevisao: true, valor: 100 },
      { dias: 5, isPrevisao: false, valor: 10 },
    ]);
    expect(r.semVencimento).toBe(1000);
    expect(r.faixas.reduce((s, f) => s + f.efetivo + f.previsao, 0)).toBe(10);
  });

  it("o total das faixas mais o 'sem vencimento' é o total dos itens", () => {
    const itens = [-30, -1, 0, 15, 31, 46, 61, 91, 121, null, null].map((dias, i) => ({ dias, isPrevisao: i % 2 === 0, valor: (i + 1) * 100 }));
    const r = agruparPorFaixa(itens);
    const total = r.faixas.reduce((s, f) => s + f.efetivo + f.previsao, 0) + r.semVencimento;
    expect(total).toBe(itens.reduce((s, i) => s + i.valor, 0));
  });
});
