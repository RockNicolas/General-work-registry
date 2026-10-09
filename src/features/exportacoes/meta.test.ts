import { describe, expect, it } from "vitest";
import { resolverFiltros } from "@/features/dashboards/filtros";
import { dataParaArquivo, descreverFiltrosLancamentos, descreverFiltrosPainel, nomeDeArquivo } from "./meta";
import { empresaDaAuditoria } from "./service";

const OBRA = "11111111-1111-4111-8111-111111111111";
const opcoes = {
  empresas: [{ id: "emp-a", nome: "Construtora Alfa" }],
  obras: [{ id: OBRA, codigo: "OB-1", nome: "Residencial Sol" }],
};

describe("descreverFiltrosPainel", () => {
  it("padrão: período e 'tudo'", () => {
    const f = descreverFiltrosPainel(resolverFiltros({}, "2026-10-04"), opcoes);
    expect(f).toEqual([
      { rotulo: "Período", valor: "nov/2025 a out/2026" },
      { rotulo: "Empresa", valor: "Todas as que você acompanha" },
      { rotulo: "Obra", valor: "Todas as obras" },
      { rotulo: "Grupo de custo", valor: "Todos os grupos" },
    ]);
  });

  it("com filtros: mostra NOMES, nunca ids", () => {
    const f = descreverFiltrosPainel(resolverFiltros({ empresa: "emp-a", obra: OBRA, grupo: "mao_obra_direta", de: "2026-03", ate: "2026-03" }, "2026-10-04"), opcoes);
    expect(f).toEqual([
      { rotulo: "Período", valor: "mar/2026" },
      { rotulo: "Empresa", valor: "Construtora Alfa" },
      { rotulo: "Obra", valor: "OB-1 — Residencial Sol" },
      { rotulo: "Grupo de custo", valor: "Mão de obra direta (MOD)" },
    ]);
    expect(JSON.stringify(f)).not.toContain(OBRA);
  });

  it("empresa/obra que o usuário não enxerga não vaza o id nem o nome: '(não disponível)'", () => {
    const f = descreverFiltrosPainel(resolverFiltros({ empresa: "emp-secreta", obra: "22222222-2222-4222-8222-222222222222" }, "2026-10-04"), opcoes);
    expect(f[1]).toEqual({ rotulo: "Empresa", valor: "(não disponível)" });
    expect(f[2]).toEqual({ rotulo: "Obra", valor: "(não disponível)" });
    expect(JSON.stringify(f)).not.toContain("emp-secreta");
  });
});

describe("descreverFiltrosLancamentos", () => {
  const obra = { codigo: "OB-1", nome: "Residencial Sol", empresaNome: "Construtora Alfa" };

  it("sem filtros, diz que são todos", () => {
    expect(descreverFiltrosLancamentos(obra, {}).at(-1)).toEqual({ rotulo: "Filtros", valor: "nenhum (todos os lançamentos da obra)" });
  });

  it("lista só o que foi filtrado, com datas em dd/mm/aaaa", () => {
    const f = descreverFiltrosLancamentos(obra, { tipo: "custo", situacao: "a_realizar", de: "2026-03-01", ate: "2026-03-31", q: "cimento" });
    expect(f.map((x) => x.rotulo)).toEqual(["Empresa", "Obra", "Tipo", "Situação", "Competência a partir de", "Competência até", "Busca"]);
    expect(f.find((x) => x.rotulo === "Competência a partir de")?.valor).toBe("01/03/2026");
    expect(f.find((x) => x.rotulo === "Situação")?.valor).toBe("A realizar");
  });

  it("classe sai com o nome, não o código", () => {
    const f = descreverFiltrosLancamentos(obra, { classe: "devolucao_socio" });
    expect(f.find((x) => x.rotulo === "Classe")?.valor).toBe("Devolução a sócios");
  });
});

describe("nomeDeArquivo", () => {
  it("ASCII, minúsculo, sem espaços nem caracteres de caminho", () => {
    expect(nomeDeArquivo(["painel", "2025-11", "a", "2026-10"], "xlsx")).toBe("rgo-painel-2025-11-a-2026-10.xlsx");
    expect(nomeDeArquivo(["lancamentos", "São José/../etc", "20261004"], "pdf")).toBe("rgo-lancamentos-sao-jose-etc-20261004.pdf");
    expect(nomeDeArquivo(["../../x"], "xlsx")).toBe("rgo-x.xlsx");
  });
  it("sem nada aproveitável, um nome genérico", () => {
    expect(nomeDeArquivo(["///", "  "], "pdf")).toBe("rgo-relatorio.pdf");
  });
});

describe("dataParaArquivo", () => {
  it("usa o dia de Brasília", () => {
    expect(dataParaArquivo(new Date("2026-10-05T01:00:00Z"))).toBe("20261004");
    expect(dataParaArquivo(new Date("2026-10-05T12:00:00Z"))).toBe("20261005");
  });
});

describe("empresaDaAuditoria", () => {
  it("a pedida, se for visível", () => {
    expect(empresaDaAuditoria([{ id: "a" }, { id: "b" }], "b")).toBe("b");
  });
  it("pedida que o usuário não enxerga nunca é usada", () => {
    expect(empresaDaAuditoria([{ id: "a" }, { id: "b" }], "x")).toBeNull();
    expect(empresaDaAuditoria([{ id: "a" }], "x")).toBe("a"); // cai na única visível
  });
  it("sem pedido: a única visível, ou nenhuma se forem várias", () => {
    expect(empresaDaAuditoria([{ id: "a" }])).toBe("a");
    expect(empresaDaAuditoria([{ id: "a" }, { id: "b" }])).toBeNull();
    expect(empresaDaAuditoria([])).toBeNull();
  });
});
