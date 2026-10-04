import { describe, expect, it } from "vitest";
import {
  parseCompetencia,
  parseData,
  parseDinheiro,
  parseInteiro,
  parseLista,
  parsePercentual,
  parseSimNao,
  textoDe,
} from "./valores";

const ok = (valor: unknown) => ({ ok: true, valor });

describe("parseData", () => {
  it.each([
    ["31/03/2026", "2026-03-31"],
    ["1/3/2026", "2026-03-01"],
    ["01-03-2026", "2026-03-01"],
    ["01.03.2026", "2026-03-01"],
    ["2026-03-31", "2026-03-31"],
    ["2026-03-31T00:00:00.000Z", "2026-03-31"],
    [46112, "2026-03-31"], // serial do Excel
    ["46112", "2026-03-31"],
    [new Date(Date.UTC(2026, 2, 31)), "2026-03-31"],
  ])("lê %j como %s", (entrada, esperado) => {
    expect(parseData(entrada)).toEqual(ok(esperado));
  });

  it.each(["31/02/2026", "29/02/2025", "32/01/2026", "abc", "2026/03/31", "01/01/1850", "01/01/2300", 12, -5])(
    "rejeita %j",
    (entrada) => {
      expect(parseData(entrada).ok).toBe(false);
    },
  );

  it("vazio é nulo, não erro", () => {
    for (const v of [null, undefined, "", "   "]) expect(parseData(v)).toEqual(ok(null));
  });

  it("o serial 61 (1/3/1900 no Excel) fica fora do intervalo aceito", () => {
    expect(parseData(61).ok).toBe(false);
  });
});

describe("parseCompetencia", () => {
  it.each([
    ["03/2026", "2026-03-01"],
    ["3/2026", "2026-03-01"],
    ["2026-03", "2026-03-01"],
    ["15/03/2026", "2026-03-01"],
    [46112, "2026-03-01"],
  ])("lê %j como %s", (entrada, esperado) => {
    expect(parseCompetencia(entrada)).toEqual(ok(esperado));
  });

  it.each(["13/2026", "00/2026", "março", "2026-13"])("rejeita %j", (entrada) => {
    expect(parseCompetencia(entrada).ok).toBe(false);
  });
});

describe("parseDinheiro", () => {
  it.each([
    [1234.56, 123456],
    [10, 1000],
    [-5.5, -550],
    [0.1 + 0.2, 30], // sem erro de ponto flutuante
    ["1.234,56", 123456],
    ["R$ 1.234,56", 123456],
    ["1234,5", 123450],
    ["-10", -1000],
    ["(1.234,56)", -123456],
    ["1234.56", 123456],
    ["0,05", 5],
  ])("lê %j como %i centavos", (entrada, esperado) => {
    expect(parseDinheiro(entrada)).toEqual(ok(esperado));
  });

  it.each(["abc", "1,234,56", "12,345", "1.2.3", NaN, Infinity, 1.005])("rejeita %j", (entrada) => {
    expect(parseDinheiro(entrada).ok).toBe(false);
  });

  it("vazio é nulo", () => {
    expect(parseDinheiro("")).toEqual(ok(null));
    expect(parseDinheiro(null)).toEqual(ok(null));
  });
});

describe("parsePercentual", () => {
  it.each([
    ["12,5", 1250],
    ["12,5%", 1250],
    ["100", 10000],
    [4.5, 450],
    [0, 0],
    ["0,25", 25],
  ])("lê %j como %i pontos-base", (entrada, esperado) => {
    expect(parsePercentual(entrada)).toEqual(ok(esperado));
  });

  it.each(["101", 100.5, -1, "abc", "1,2,3"])("rejeita %j", (entrada) => {
    expect(parsePercentual(entrada).ok).toBe(false);
  });
});

describe("parseInteiro, parseSimNao, parseLista", () => {
  it("inteiro", () => {
    expect(parseInteiro("3")).toEqual(ok(3));
    expect(parseInteiro(2)).toEqual(ok(2));
    expect(parseInteiro("1,5").ok).toBe(false);
    expect(parseInteiro("")).toEqual(ok(null));
  });

  it("sim/não", () => {
    for (const v of ["sim", "SIM", "S", "x", 1, "verdadeiro"]) expect(parseSimNao(v)).toEqual(ok(true));
    for (const v of ["nao", "NÃO", "n", 0, "", null]) expect(parseSimNao(v)).toEqual(ok(false));
    expect(parseSimNao("talvez").ok).toBe(false);
  });

  it("lista com sinônimos, ignorando acento e caixa", () => {
    const sin = { custo: "custo", despesa: "custo", receita: "receita" } as const;
    expect(parseLista(" Despesa ", sin, "custo ou receita")).toEqual(ok("custo"));
    expect(parseLista("RECEITA", sin, "x")).toEqual(ok("receita"));
    expect(parseLista("", sin, "x")).toEqual(ok(null));
    const r = parseLista("outro", sin, "custo ou receita");
    expect(r).toEqual({ ok: false, erro: "Valor inválido: use custo ou receita" });
  });
});

describe("textoDe", () => {
  it("mostra o valor como o usuário digitou", () => {
    expect(textoDe(" abc ")).toBe("abc");
    expect(textoDe(12.5)).toBe("12.5");
    expect(textoDe(null)).toBe("");
    expect(textoDe(new Date(Date.UTC(2026, 0, 2)))).toBe("2026-01-02");
  });
});
