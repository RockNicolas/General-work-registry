import { describe, expect, it } from "vitest";
import { decodificarTexto, detectarDelimitador, parseCsv } from "./csv";

describe("detectarDelimitador", () => {
  it("escolhe o separador mais frequente na primeira linha", () => {
    expect(detectarDelimitador("a;b;c\n1;2;3")).toBe(";");
    expect(detectarDelimitador("a,b,c\n1,2,3")).toBe(",");
    expect(detectarDelimitador("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("ignora separadores dentro de aspas e usa ; como padrão", () => {
    expect(detectarDelimitador('"a,b,c";d\n1;2')).toBe(";");
    expect(detectarDelimitador("coluna\n1")).toBe(";");
  });
});

describe("parseCsv", () => {
  it("lê campos simples e vazios", () => {
    expect(parseCsv("a;b;c\n1;;3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("respeita aspas, aspas duplicadas, delimitador e quebra de linha dentro do campo", () => {
    const texto = 'nome;obs\n"Silva; João";"disse ""oi""\ne saiu"\n';
    expect(parseCsv(texto)).toEqual([
      ["nome", "obs"],
      ["Silva; João", 'disse "oi"\ne saiu'],
    ]);
  });

  it("aceita CRLF, CR e última linha sem quebra", () => {
    expect(parseCsv("a;b\r\n1;2\r\n3;4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(parseCsv("a;b\r1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("devolve vazio para texto vazio", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("decodificarTexto", () => {
  it("UTF-8 com BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Mão de obra")]);
    expect(decodificarTexto(bytes)).toBe("Mão de obra");
  });

  it("cai para Windows-1252 quando não é UTF-8 válido", () => {
    // "Mão" em cp1252: M=4D, ã=E3, o=6F
    expect(decodificarTexto(new Uint8Array([0x4d, 0xe3, 0x6f]))).toBe("Mão");
  });
});
