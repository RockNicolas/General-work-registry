import { describe, expect, it } from "vitest";
import { adicionarMeses, diasEntre, hojeEmSaoPaulo, mesDe, mesValido, mesesEntre, primeiroDiaDoMes, rotuloMes, somarDias, ultimoDiaDoMes } from "./periodo";

describe("meses", () => {
  it("valida o formato YYYY-MM", () => {
    for (const ok of ["2026-01", "2026-12", "1999-06"]) expect(mesValido(ok), ok).toBe(true);
    for (const ruim of ["2026-13", "2026-00", "2026-1", "26-01", "2026-01-01", "", "abcd-ef"]) expect(mesValido(ruim), ruim).toBe(false);
  });

  it("soma e subtrai meses atravessando o ano", () => {
    expect(adicionarMeses("2026-01", 1)).toBe("2026-02");
    expect(adicionarMeses("2026-12", 1)).toBe("2027-01");
    expect(adicionarMeses("2026-01", -1)).toBe("2025-12");
    expect(adicionarMeses("2026-03", -14)).toBe("2025-01");
    expect(adicionarMeses("2026-03", 0)).toBe("2026-03");
    expect(adicionarMeses("2026-03", 24)).toBe("2028-03");
  });

  it("recusa mês inválido em vez de calcular lixo", () => {
    expect(() => adicionarMeses("2026-13", 1)).toThrow(RangeError);
    expect(() => ultimoDiaDoMes("x")).toThrow(RangeError);
  });

  it("lista os meses de um intervalo, inclusive", () => {
    expect(mesesEntre("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(mesesEntre("2026-05", "2026-05")).toEqual(["2026-05"]);
    expect(mesesEntre("2026-06", "2026-05")).toEqual([]);
  });

  it("primeiro e último dia, com fevereiro e bissexto", () => {
    expect(primeiroDiaDoMes("2026-02")).toBe("2026-02-01");
    expect(ultimoDiaDoMes("2026-02")).toBe("2026-02-28");
    expect(ultimoDiaDoMes("2028-02")).toBe("2028-02-29");
    expect(ultimoDiaDoMes("2026-04")).toBe("2026-04-30");
    expect(ultimoDiaDoMes("2026-12")).toBe("2026-12-31");
  });

  it("mês de uma data e rótulo em pt-BR", () => {
    expect(mesDe("2026-10-04")).toBe("2026-10");
    expect(rotuloMes("2026-03")).toBe("mar/2026");
    expect(rotuloMes("lixo")).toBe("lixo");
  });
});

describe("dias e hoje", () => {
  it("diferença em dias entre datas ISO, sem depender de fuso nem de horário de verão", () => {
    expect(diasEntre("2026-03-01", "2026-03-31")).toBe(30);
    expect(diasEntre("2026-03-31", "2026-03-01")).toBe(-30);
    expect(diasEntre("2026-02-28", "2026-03-01")).toBe(1);
    expect(diasEntre("2025-12-31", "2026-01-01")).toBe(1);
    expect(diasEntre("2026-05-05", "2026-05-05")).toBe(0);
    expect(diasEntre("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("soma dias atravessando mês e ano, inclusive bissexto", () => {
    expect(somarDias("2026-03-30", 3)).toBe("2026-04-02");
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(somarDias("2026-05-05", 0)).toBe("2026-05-05");
    expect(diasEntre("2026-03-15", somarDias("2026-03-15", 120))).toBe(120);
  });

  it("'hoje' é o dia de Brasília: 01:00 UTC ainda é o dia anterior no Brasil", () => {
    expect(hojeEmSaoPaulo(new Date("2026-03-15T01:00:00Z"))).toBe("2026-03-14");
    expect(hojeEmSaoPaulo(new Date("2026-03-15T03:00:00Z"))).toBe("2026-03-15");
    expect(hojeEmSaoPaulo(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
    expect(hojeEmSaoPaulo(new Date("2027-01-01T02:00:00Z"))).toBe("2026-12-31");
  });
});
