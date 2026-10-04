import { describe, expect, it } from "vitest";
import { formatBps, formatBpsInput, parsePercentBps } from "./percent";

describe("formatBps", () => {
  it("formata pontos-base em percentual pt-BR", () => {
    expect(formatBps(1250)).toBe("12,50%");
    expect(formatBps(0)).toBe("0,00%");
    expect(formatBps(10000)).toBe("100,00%");
    expect(formatBps(1)).toBe("0,01%");
  });
});

describe("formatBpsInput", () => {
  it("remove zeros à direita", () => {
    expect(formatBpsInput(1250)).toBe("12,5");
    expect(formatBpsInput(1200)).toBe("12");
    expect(formatBpsInput(1234)).toBe("12,34");
    expect(formatBpsInput(0)).toBe("0");
  });
});

describe("parsePercentBps", () => {
  it.each([
    ["12,5", 1250],
    ["12,50%", 1250],
    ["0", 0],
    ["100", 10000],
    ["100,00", 10000],
    [" 7,25 % ", 725],
    ["0,01", 1],
  ])("lê %j como %i", (entrada, esperado) => {
    expect(parsePercentBps(entrada)).toBe(esperado);
  });

  it.each(["", "abc", "100,01", "101", "-1", "1,234", "1.5", "12,"])("rejeita %j", (entrada) => {
    expect(parsePercentBps(entrada)).toBeNull();
  });

  it("faz ida e volta", () => {
    for (const b of [0, 1, 99, 1250, 9999, 10000]) expect(parsePercentBps(formatBpsInput(b))).toBe(b);
  });
});
