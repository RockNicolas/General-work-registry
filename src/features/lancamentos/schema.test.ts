import { describe, expect, it } from "vitest";
import { filtrosLancamentoSchema, lancamentoSchema } from "./schema";

const UUID = "3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b";

const base = {
  obraId: UUID,
  tipo: "custo" as const,
  situacao: "realizado" as const,
  classe: "operacional" as const,
  isPrevisao: false,
  valorCentavos: 150000,
  dataCompetencia: "2026-03-10",
  dataVencimento: "",
  dataLiquidacao: "2026-03-12",
  categoriaId: UUID,
  etapaId: "",
  contraparte: "",
  documento: "",
  descricao: "",
};

const erros = (entrada: unknown) => {
  const r = lancamentoSchema.safeParse(entrada);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("lancamentoSchema", () => {
  it("aceita um custo realizado completo", () => {
    expect(lancamentoSchema.safeParse(base).success).toBe(true);
  });

  it("realizado exige data de pagamento/recebimento", () => {
    expect(erros({ ...base, dataLiquidacao: "" })).toHaveProperty("dataLiquidacao", "Informe a data do pagamento");
    expect(erros({ ...base, tipo: "receita", dataLiquidacao: "" })).toHaveProperty(
      "dataLiquidacao",
      "Informe a data do recebimento",
    );
  });

  it("a realizar exige vencimento", () => {
    expect(erros({ ...base, situacao: "a_realizar", dataLiquidacao: "" })).toHaveProperty("dataVencimento");
    expect(
      lancamentoSchema.safeParse({ ...base, situacao: "a_realizar", dataLiquidacao: "", dataVencimento: "2026-04-10" }).success,
    ).toBe(true);
  });

  it("título de previsão só para a realizar", () => {
    expect(erros({ ...base, isPrevisao: true })).toHaveProperty("isPrevisao");
    expect(
      lancamentoSchema.safeParse({
        ...base,
        situacao: "a_realizar",
        dataLiquidacao: "",
        dataVencimento: "2026-04-10",
        isPrevisao: true,
      }).success,
    ).toBe(true);
  });

  it("rejeita valor zero, não inteiro e nulo; aceita estorno (negativo)", () => {
    expect(erros({ ...base, valorCentavos: 0 })).toHaveProperty("valorCentavos", "O valor não pode ser zero");
    expect(erros({ ...base, valorCentavos: 10.5 })).toHaveProperty("valorCentavos");
    expect(erros({ ...base, valorCentavos: null })).toHaveProperty("valorCentavos");
    expect(lancamentoSchema.safeParse({ ...base, valorCentavos: -5000 }).success).toBe(true);
  });

  it("valida datas e categoria", () => {
    expect(erros({ ...base, dataCompetencia: "31/02/2026" })).toHaveProperty("dataCompetencia");
    expect(erros({ ...base, dataCompetencia: "2026-02-30" })).toHaveProperty("dataCompetencia");
    expect(erros({ ...base, categoriaId: "" })).toHaveProperty("categoriaId", "Escolha a categoria");
  });
});

describe("filtrosLancamentoSchema", () => {
  it("descarta valores inválidos em vez de falhar", () => {
    const f = filtrosLancamentoSchema.parse({ tipo: "xyz", situacao: "realizado", de: "lixo", pagina: "abc" });
    expect(f.tipo).toBeUndefined();
    expect(f.situacao).toBe("realizado");
    expect(f.de).toBeUndefined();
    expect(f.pagina).toBe(1);
  });

  it("lê página e período válidos", () => {
    const f = filtrosLancamentoSchema.parse({ pagina: "3", de: "2026-01-01", ate: "2026-03-31", q: " cimento " });
    expect(f).toMatchObject({ pagina: 3, de: "2026-01-01", ate: "2026-03-31", q: "cimento" });
  });
});
