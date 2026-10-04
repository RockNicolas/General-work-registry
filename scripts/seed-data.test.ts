import { describe, expect, it } from "vitest";
import { cnpjValido } from "../src/lib/cnpj";
import { EMPRESAS, GRUPOS, HOJE, OBRAS, gerarObra, somaMeses } from "./seed-data";

describe("dados do seed", () => {
  it("as fatias de custo somam 100%", () => {
    expect(GRUPOS.reduce((s, g) => s + g.fatia, 0)).toBeCloseTo(1, 10);
  });

  it("os CNPJs das empresas demo são válidos", () => {
    for (const e of EMPRESAS) expect(cnpjValido(e.cnpj), e.nome).toBe(true);
  });

  it("toda obra pertence a uma empresa existente e tem código único", () => {
    const chaves = new Set(EMPRESAS.map((e) => e.key));
    expect(OBRAS.every((o) => chaves.has(o.empresa))).toBe(true);
    expect(new Set(OBRAS.map((o) => o.codigo)).size).toBe(OBRAS.length);
  });

  it("somaMeses atravessa o ano", () => {
    expect(somaMeses("2025-11", 3)).toBe("2026-02");
    expect(somaMeses("2026-01", -1)).toBe("2025-12");
  });
});

describe("gerarObra", () => {
  it("é determinística: a mesma obra gera exatamente os mesmos dados", () => {
    const o = OBRAS[0]!;
    expect(gerarObra(o)).toEqual(gerarObra(o));
  });

  it("o orçamento de cada obra soma o valor orçado (sem perder centavos)", () => {
    for (const o of OBRAS) {
      const total = gerarObra(o).orcamento.reduce((s, i) => s + i.valorCentavos, 0);
      // Cada grupo é arredondado individualmente: tolera diferença de poucos centavos.
      expect(Math.abs(total - o.orcamentoReais * 100), o.codigo).toBeLessThanOrEqual(GRUPOS.length * 6);
    }
  });

  it("obra planejada só tem orçamento (sem lançamentos nem avanço)", () => {
    const r = gerarObra(OBRAS.find((o) => o.status === "planejada")!);
    expect(r.orcamento.length).toBeGreaterThan(0);
    expect(r.lancamentos).toHaveLength(0);
    expect(r.avanco).toHaveLength(0);
  });

  it("valores sempre inteiros e positivos; datas de competência nunca depois de fim do próximo ano", () => {
    for (const o of OBRAS) {
      for (const l of gerarObra(o).lancamentos) {
        expect(Number.isSafeInteger(l.valorCentavos)).toBe(true);
        expect(l.valorCentavos).toBeGreaterThan(0);
      }
    }
  });

  it("realizado tem data de liquidação até hoje; a realizar não tem", () => {
    for (const o of OBRAS) {
      for (const l of gerarObra(o).lancamentos) {
        if (l.situacao === "realizado") {
          expect(l.dataLiquidacao, o.codigo).not.toBeNull();
          expect(l.dataLiquidacao! <= HOJE, `${o.codigo} ${l.dataLiquidacao}`).toBe(true);
        } else {
          expect(l.dataLiquidacao).toBeNull();
          expect(l.dataVencimento).not.toBeNull();
        }
      }
    }
  });

  it("id_origem é único dentro da empresa (índice único no banco)", () => {
    for (const e of EMPRESAS) {
      const ids = OBRAS.filter((o) => o.empresa === e.key)
        .flatMap((o) => gerarObra(o).lancamentos)
        .map((l) => l.idOrigem)
        .filter((x): x is string => x !== null);
      expect(new Set(ids).size, e.nome).toBe(ids.length);
    }
  });

  it("avanço acumulado nunca decresce nem passa de 100%", () => {
    for (const o of OBRAS) {
      for (const tipo of ["planejado", "realizado"] as const) {
        const serie = gerarObra(o).avanco.filter((a) => a.tipo === tipo);
        let ant = 0;
        for (const a of serie) {
          expect(a.pctAcumBps).toBeGreaterThanOrEqual(ant);
          expect(a.pctAcumBps).toBeLessThanOrEqual(10_000);
          expect(a.competencia.endsWith("-01")).toBe(true);
          ant = a.pctAcumBps;
        }
      }
    }
  });

  it("aportes e devoluções a sócios existem fora da classe operacional", () => {
    const r = gerarObra(OBRAS.find((o) => o.codigo === "AUR-002")!);
    expect(r.lancamentos.some((l) => l.classe === "aporte")).toBe(true);
    expect(r.lancamentos.some((l) => l.classe === "devolucao_socio")).toBe(true);
  });

  it("obras ativas têm contas a pagar nas faixas de 30/60/90/120 dias, com previsão", () => {
    const r = gerarObra(OBRAS.find((o) => o.codigo === "AUR-001")!);
    const aPagar = r.lancamentos.filter((l) => l.tipo === "custo" && l.situacao === "a_realizar");
    expect(aPagar.length).toBeGreaterThan(10);
    expect(aPagar.some((l) => l.isPrevisao)).toBe(true);
    expect(aPagar.some((l) => !l.isPrevisao)).toBe(true);
  });
});
