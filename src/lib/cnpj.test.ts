import { describe, expect, it } from "vitest";
import { cnpjValido, formatarCnpj, limparCnpj } from "./cnpj";

describe("cnpjValido", () => {
  it.each(["11.222.333/0001-81", "11222333000181", "45.997.418/0001-53"])("aceita %s", (cnpj) => {
    expect(cnpjValido(cnpj)).toBe(true);
  });

  it("aceita o exemplo alfanumérico oficial da Receita", () => {
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
    expect(cnpjValido("12abc34501de35")).toBe(true);
  });

  it.each([
    "11.222.333/0001-82", // dígito errado
    "12.ABC.345/01DE-36",
    "00.000.000/0000-00",
    "11.111.111/1111-11",
    "123",
    "",
    "11.222.333/0001-8A", // dígito verificador não pode ser letra
  ])("rejeita %j", (cnpj) => {
    expect(cnpjValido(cnpj)).toBe(false);
  });
});

describe("formatarCnpj / limparCnpj", () => {
  it("formata com máscara", () => {
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
  });

  it("devolve o texto limpo se incompleto", () => {
    expect(formatarCnpj("1122")).toBe("1122");
    expect(limparCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });
});
