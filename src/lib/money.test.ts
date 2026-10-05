import { describe, expect, it } from "vitest";
import { formatBRL, formatBRLCompact, formatDecimalBR, parseBRL } from "./money";

// Intl usa espaço não separável entre "R$" e o valor.
const norm = (s: string) => s.replace(/ /g, " ");

describe("formatBRL", () => {
  it("formata centavos em reais pt-BR", () => {
    expect(norm(formatBRL(123456))).toBe("R$ 1.234,56");
    expect(norm(formatBRL(0))).toBe("R$ 0,00");
    expect(norm(formatBRL(5))).toBe("R$ 0,05");
  });

  it("formata negativos", () => {
    expect(norm(formatBRL(-123456))).toBe("-R$ 1.234,56");
  });

  it("rejeita valores não inteiros", () => {
    expect(() => formatBRL(10.5)).toThrow(RangeError);
  });
});

describe("formatBRLCompact", () => {
  it("abrevia valores grandes para eixos de gráfico", () => {
    expect(norm(formatBRLCompact(123_456_789))).toBe("R$ 1,2 mi");
    expect(norm(formatBRLCompact(35_000_000))).toBe("R$ 350 mil");
    expect(norm(formatBRLCompact(0))).toBe("R$ 0");
  });

  it("negativos mantêm o sinal e aceita não inteiros (o eixo interpola)", () => {
    expect(norm(formatBRLCompact(-123_456_789))).toBe("-R$ 1,2 mi");
    expect(() => formatBRLCompact(12_345.5)).not.toThrow();
  });
});

describe("parseBRL", () => {
  it.each([
    ["R$ 1.234,56", 123456],
    ["1234,56", 123456],
    ["1.234", 123400],
    ["10", 1000],
    ["0,5", 50],
    ["0,05", 5],
    ["-1.234,56", -123456],
    ["  R$ 2.000.000,00 ", 200000000],
  ])("lê %j como %i centavos", (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it.each(["", "abc", "1,234,56", "1.23", "12,345", "R$", "1.234,5,6"])(
    "rejeita %j",
    (input) => {
      expect(parseBRL(input)).toBeNull();
    },
  );

  it("faz ida e volta com formatBRL", () => {
    for (const centavos of [0, 1, 99, 100, 123456, -987654321]) {
      expect(parseBRL(formatBRL(centavos))).toBe(centavos);
    }
  });
});

describe("formatDecimalBR", () => {
  it("formata sem símbolo, para campos de entrada", () => {
    expect(formatDecimalBR(123456)).toBe("1.234,56");
    expect(formatDecimalBR(5)).toBe("0,05");
    expect(formatDecimalBR(-100)).toBe("-1,00");
  });

  it("faz ida e volta com parseBRL", () => {
    for (const c of [0, 1, 99, 100, 123456, -987654321]) expect(parseBRL(formatDecimalBR(c))).toBe(c);
  });
});
