import { describe, expect, it } from "vitest";
import { CRON_VALIDO, lerConfig } from "./config";
import { classificarClasse, grupoPorNome } from "./classificar";

describe("classificarClasse", () => {
  it.each([
    ["Aporte de capital dos sócios", "receita", "aporte"],
    ["Receita - APORTE", "receita", "aporte"],
    ["Adiantamento de cliente", "receita", "adiantamento"],
    ["Medições e vendas", "receita", "operacional"],
    ["Devolução de aporte aos sócios", "custo", "devolucao_socio"],
    ["Devolução a sócio", "custo", "devolucao_socio"],
    ["Distribuição de lucros", "custo", "devolucao_socio"],
    ["Pró-labore", "custo", "devolucao_socio"],
    ["Materiais de construção", "custo", "operacional"],
    // Cada regra só vale no tipo certo (adiantamento a fornecedor é custo operacional).
    ["Adiantamento a fornecedor", "custo", "operacional"],
    ["Aporte", "custo", "operacional"],
    ["Devolução de sócio", "receita", "operacional"],
  ] as const)("%s (%s) → %s", (pista, tipo, esperado) => {
    expect(classificarClasse(pista, tipo)).toBe(esperado);
  });
});

describe("grupoPorNome", () => {
  it.each([
    ["Materiais de construção", "custo", "material"],
    ["Cimento e concreto", "custo", "material"],
    ["Mão de obra direta", "custo", "mao_obra_direta"],
    ["Folha de pagamento - encargos", "custo", "mao_obra_direta"],
    ["Mão de obra indireta", "custo", "mao_obra_indireta"],
    ["Locação de equipamentos", "custo", "maquinas_equipamentos"],
    ["Serviços de terceiros", "custo", "servicos"],
    ["Projetos e consultoria", "custo", "servicos"],
    ["Despesas administrativas", "custo", "outros"],
    ["Qualquer coisa", "custo", "outros"],
    ["Medições", "receita", "receita"],
  ] as const)("%s (%s) → %s", (nome, tipo, esperado) => {
    expect(grupoPorNome(nome, tipo)).toBe(esperado);
  });
});

describe("lerConfig", () => {
  it("aplica os padrões a uma config vazia ou ausente", () => {
    const c = lerConfig({});
    expect(c).toMatchObject({ mesesHistorico: 24, mesesReprocessar: 3, mesesFuturos: 6, valorPagamento: "liquido", escalaPercentual: "0-100", sincronizarOrcamento: true });
    expect(lerConfig(null).mesesHistorico).toBe(24);
    expect(lerConfig(undefined).eventosWebhook).toEqual([]);
  });

  it("mantém o que foi configurado e ignora campos desconhecidos", () => {
    const c = lerConfig({ indexadorCorrecaoId: 3, mesesFuturos: 12, valorPagamento: "bruto", lixo: true });
    expect(c).toMatchObject({ indexadorCorrecaoId: 3, mesesFuturos: 12, valorPagamento: "bruto" });
  });

  it("config inválida cai nos padrões em vez de quebrar a sincronização", () => {
    expect(lerConfig({ mesesHistorico: -5 }).mesesHistorico).toBe(24);
    expect(lerConfig("texto").mesesFuturos).toBe(6);
  });
});

describe("CRON_VALIDO", () => {
  it.each(["0 6 * * *", "0 */6 * * *", "0 10,16 * * 1-5", "*/15 * * * *"])("aceita %s", (c) => expect(CRON_VALIDO.test(c)).toBe(true));
  it.each(["", "0 6 * *", "abc", "0 6 * * * *", "0 6 * * *; rm -rf", "@daily"])("rejeita %j", (c) => expect(CRON_VALIDO.test(c)).toBe(false));
});
