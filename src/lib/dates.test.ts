import { describe, expect, it } from "vitest";
import { formatDateBR, formatDateTimeBR, parseDateBR } from "./dates";

describe("formatDateBR", () => {
  it("converte ISO para dd/mm/aaaa sem deslocar o dia", () => {
    expect(formatDateBR("2026-10-04")).toBe("04/10/2026");
    expect(formatDateBR("2024-02-29")).toBe("29/02/2024");
  });

  it("rejeita datas inexistentes ou mal formatadas", () => {
    expect(formatDateBR("2026-02-30")).toBeNull();
    expect(formatDateBR("2026-13-01")).toBeNull();
    expect(formatDateBR("04/10/2026")).toBeNull();
  });
});

describe("parseDateBR", () => {
  it("converte dd/mm/aaaa para ISO", () => {
    expect(parseDateBR("04/10/2026")).toBe("2026-10-04");
    expect(parseDateBR(" 29/02/2024 ")).toBe("2024-02-29");
  });

  it("rejeita datas inexistentes ou mal formatadas", () => {
    expect(parseDateBR("29/02/2025")).toBeNull();
    expect(parseDateBR("31/04/2026")).toBeNull();
    expect(parseDateBR("2026-10-04")).toBeNull();
    expect(parseDateBR("4/10/2026")).toBeNull();
  });
});

describe("formatDateTimeBR", () => {
  it("exibe o instante em America/Sao_Paulo", () => {
    // 2026-10-04T15:30:00Z = 12:30 em Brasília (UTC-3, sem horário de verão)
    expect(formatDateTimeBR(new Date("2026-10-04T15:30:00Z"))).toBe("04/10/2026 12:30");
  });
});
