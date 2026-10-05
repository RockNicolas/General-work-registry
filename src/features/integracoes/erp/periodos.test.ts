import { describe, expect, it } from "vitest";
import { dividirEmMeses, janelaDaSincronizacao, listarMeses, somaMeses, ultimoDiaDoMes } from "./periodos";

describe("períodos", () => {
  it("somaMeses atravessa o ano nos dois sentidos", () => {
    expect(somaMeses("2026-11", 3)).toBe("2027-02");
    expect(somaMeses("2026-01", -1)).toBe("2025-12");
    expect(somaMeses("2026-06", 0)).toBe("2026-06");
  });

  it("ultimoDiaDoMes considera bissexto", () => {
    expect(ultimoDiaDoMes("2026-02")).toBe("2026-02-28");
    expect(ultimoDiaDoMes("2028-02")).toBe("2028-02-29");
    expect(ultimoDiaDoMes("2026-04")).toBe("2026-04-30");
    expect(ultimoDiaDoMes("2026-12")).toBe("2026-12-31");
  });

  it("dividirEmMeses corta a primeira e a última pontas pela janela", () => {
    expect(dividirEmMeses({ inicio: "2026-01-15", fim: "2026-03-10" })).toEqual([
      { inicio: "2026-01-15", fim: "2026-01-31" },
      { inicio: "2026-02-01", fim: "2026-02-28" },
      { inicio: "2026-03-01", fim: "2026-03-10" },
    ]);
    expect(dividirEmMeses({ inicio: "2026-05-02", fim: "2026-05-20" })).toEqual([{ inicio: "2026-05-02", fim: "2026-05-20" }]);
    expect(dividirEmMeses({ inicio: "2026-12-01", fim: "2027-01-31" })).toHaveLength(2);
  });

  it("listarMeses é inclusivo", () => {
    expect(listarMeses("2026-11", "2027-01")).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(listarMeses("2026-03", "2026-03")).toEqual(["2026-03"]);
  });

  it("janela incremental: poucos meses atrás até os meses futuros", () => {
    const cfg = { mesesHistorico: 24, mesesReprocessar: 3, mesesFuturos: 6 };
    expect(janelaDaSincronizacao("incremental", cfg, "2026-10-04")).toEqual({ inicio: "2026-07-01", fim: "2027-04-30" });
    expect(janelaDaSincronizacao("historica", cfg, "2026-10-04")).toEqual({ inicio: "2024-10-01", fim: "2027-04-30" });
  });
});
