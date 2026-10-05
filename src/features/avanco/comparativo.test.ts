import { describe, expect, it } from "vitest";
import { type AvancoLinha, compararAvanco, versaoBase } from "./comparativo";

const l = (competencia: string, tipo: AvancoLinha["tipo"], versao: number, mes: number, acum: number): AvancoLinha => ({
  competencia,
  tipo,
  versao,
  pctMesBps: mes,
  pctAcumBps: acum,
});

describe("compararAvanco", () => {
  it("junta planejado e realizado por mês e calcula o desvio acumulado", () => {
    const r = compararAvanco([
      l("2026-02-01", "planejado", 0, 1000, 2500),
      l("2026-01-01", "planejado", 0, 1500, 1500),
      l("2026-01-01", "realizado", 0, 1200, 1200),
      l("2026-02-01", "realizado", 0, 1100, 2300),
    ]);
    expect(r.map((m) => m.competencia)).toEqual(["2026-01-01", "2026-02-01"]);
    expect(r[0]).toMatchObject({ planejadoAcumBps: 1500, realizadoAcumBps: 1200, desvioAcumBps: -300 });
    expect(r[1]).toMatchObject({ planejadoAcumBps: 2500, realizadoAcumBps: 2300, desvioAcumBps: -200 });
  });

  it("sem o outro lado, o desvio é nulo", () => {
    const r = compararAvanco([l("2026-03-01", "planejado", 0, 800, 3300)]);
    expect(r[0]).toMatchObject({ planejadoAcumBps: 3300, realizadoAcumBps: null, desvioAcumBps: null });
  });

  it("usa a versão do planejamento escolhida e ignora as demais", () => {
    const linhas = [
      l("2026-01-01", "planejado", 0, 1000, 1000),
      l("2026-01-01", "planejado", 1, 700, 700),
      l("2026-01-01", "realizado", 0, 800, 800),
    ];
    expect(compararAvanco(linhas, 0)[0]?.planejadoAcumBps).toBe(1000);
    expect(compararAvanco(linhas, 1)[0]?.planejadoAcumBps).toBe(700);
    expect(compararAvanco(linhas, 5)[0]?.planejadoAcumBps).toBeNull();
  });

  it("sem versão escolhida, a linha de base é a MENOR versão planejada (planilha usa 0; o Sienge, 1)", () => {
    // Só versão 1 (o que o Sienge grava): antes, o padrão 0 descartava o planejamento inteiro.
    const sienge = [l("2026-01-01", "planejado", 1, 600, 600), l("2026-01-01", "realizado", 0, 500, 500)];
    expect(compararAvanco(sienge)[0]).toMatchObject({ planejadoAcumBps: 600, realizadoAcumBps: 500, desvioAcumBps: -100 });

    // Com revisões, a base continua sendo a primeira versão, não a mais recente.
    const revisado = [l("2026-01-01", "planejado", 1, 600, 600), l("2026-01-01", "planejado", 2, 450, 450)];
    expect(compararAvanco(revisado)[0]?.planejadoAcumBps).toBe(600);
    expect(compararAvanco(revisado, 2)[0]?.planejadoAcumBps).toBe(450);
  });

  it("versaoBase: nula sem planejamento", () => {
    expect(versaoBase([])).toBeNull();
    expect(versaoBase([l("2026-01-01", "realizado", 0, 1, 1)])).toBeNull();
    expect(versaoBase([l("2026-01-01", "planejado", 3, 1, 1), l("2026-02-01", "planejado", 2, 1, 1)])).toBe(2);
  });

  it("no realizado vale a versão mais recente do mês", () => {
    const r = compararAvanco([l("2026-01-01", "realizado", 0, 500, 500), l("2026-01-01", "realizado", 1, 600, 600)]);
    expect(r[0]?.realizadoAcumBps).toBe(600);
  });

  it("lista vazia", () => {
    expect(compararAvanco([])).toEqual([]);
  });
});
