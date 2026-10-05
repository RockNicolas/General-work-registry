import { describe, expect, it } from "vitest";
import { MESES_MAXIMO, filtrosParaParams, resolverFiltros } from "./filtros";
import { mesesEntre } from "./periodo";

const HOJE = "2026-10-04";
const OBRA = "11111111-1111-4111-8111-111111111111";

describe("resolverFiltros", () => {
  it("sem nada na URL: últimos 12 meses terminando no mês de hoje", () => {
    expect(resolverFiltros({}, HOJE)).toEqual({ empresaId: undefined, obraId: undefined, grupo: undefined, de: "2025-11", ate: "2026-10" });
    expect(resolverFiltros(undefined, HOJE).de).toBe("2025-11");
    expect(resolverFiltros(null, HOJE).ate).toBe("2026-10");
  });

  it("aceita os filtros válidos", () => {
    const f = resolverFiltros({ empresa: "emp-1", obra: OBRA, grupo: "material", de: "2026-01", ate: "2026-06" }, HOJE);
    expect(f).toEqual({ empresaId: "emp-1", obraId: OBRA, grupo: "material", de: "2026-01", ate: "2026-06" });
  });

  it("descarta valores inválidos em vez de quebrar", () => {
    const f = resolverFiltros({ empresa: "", obra: "nao-e-uuid", grupo: "inexistente", de: "2026-13", ate: "ontem" }, HOJE);
    expect(f).toEqual({ empresaId: undefined, obraId: undefined, grupo: undefined, de: "2025-11", ate: "2026-10" });
  });

  it("só 'de': a janela termina no mês de hoje; só 'ate': começa 11 meses antes dele", () => {
    expect(resolverFiltros({ de: "2026-03" }, HOJE)).toMatchObject({ de: "2026-03", ate: "2026-10" });
    expect(resolverFiltros({ ate: "2026-03" }, HOJE)).toMatchObject({ de: "2025-04", ate: "2026-03" });
  });

  it("de e ate invertidos são trocados", () => {
    expect(resolverFiltros({ de: "2026-08", ate: "2026-02" }, HOJE)).toMatchObject({ de: "2026-02", ate: "2026-08" });
  });

  it("janela acima de 60 meses é encurtada pelo início", () => {
    const f = resolverFiltros({ de: "2015-01", ate: "2026-06" }, HOJE);
    expect(f.ate).toBe("2026-06");
    expect(mesesEntre(f.de, f.ate)).toHaveLength(MESES_MAXIMO);
    expect(f.de).toBe("2021-07");
  });

  it("um mês só é uma janela válida", () => {
    expect(resolverFiltros({ de: "2026-05", ate: "2026-05" }, HOJE)).toMatchObject({ de: "2026-05", ate: "2026-05" });
  });

  it("gera os parâmetros de URL só do que foi escolhido", () => {
    expect(filtrosParaParams(resolverFiltros({}, HOJE))).toEqual({ de: "2025-11", ate: "2026-10" });
    expect(filtrosParaParams(resolverFiltros({ empresa: "e", obra: OBRA, grupo: "servicos" }, HOJE))).toEqual({
      de: "2025-11",
      ate: "2026-10",
      empresa: "e",
      obra: OBRA,
      grupo: "servicos",
    });
  });
});
