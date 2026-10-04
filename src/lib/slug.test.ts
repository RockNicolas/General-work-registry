import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("remove acentos, símbolos e espaços", () => {
    expect(slugify("Construtora São José Ltda.")).toBe("construtora-sao-jose-ltda");
    expect(slugify("  --Ação & Cia!! ")).toBe("acao-cia");
  });

  it("vazio quando só há símbolos", () => {
    expect(slugify("***")).toBe("");
  });

  it("limita o tamanho", () => {
    expect(slugify("a".repeat(100)).length).toBe(60);
  });
});
