import { describe, expect, it } from "vitest";
import type { ArquivoCru, FolhaCrua } from "./ler-arquivo";
import { type Referencias, chaveCategoria, chaveEtapa, chaveObra, montarPrevia } from "./montar-previa";
import type { DatasetKey } from "./modelo";

const OBRA = "11111111-1111-4111-8111-111111111111";
const OUTRA_OBRA = "22222222-2222-4222-8222-222222222222";
const CAT_MATERIAL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ETAPA_03 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const ref: Referencias = {
  obraPorCodigo: new Map([[chaveObra("AUR-001"), OBRA], [chaveObra("AUR-002"), OUTRA_OBRA]]),
  categoriaPorNome: new Map([[chaveCategoria("Materiais de construção"), CAT_MATERIAL]]),
  etapaPorObraCodigo: new Map([[chaveEtapa(OBRA, "03"), ETAPA_03]]),
};

const folha = (dataset: DatasetKey, linhas: Record<string, unknown>[], extra: Partial<FolhaCrua> = {}): ArquivoCru => ({
  erros: [],
  folhas: [
    {
      dataset,
      aba: dataset === "lancamentos" ? "Lancamentos" : dataset === "orcamento" ? "Orcamento" : "AvancoFisico",
      colunasAusentes: [],
      colunasIgnoradas: [],
      linhas: linhas.map((valores, i) => ({ numero: i + 2, valores })),
      ...extra,
    },
  ],
});

const custo = (extra: Record<string, unknown> = {}) => ({
  codigo_obra: "AUR-001",
  tipo: "custo",
  data: "10/03/2026",
  data_pagamento: "12/03/2026",
  valor: "1.234,56",
  categoria: "Materiais de construção",
  ...extra,
});

describe("montarPrevia: lançamentos", () => {
  it("valida, resolve referências e normaliza uma linha completa", () => {
    const p = montarPrevia(folha("lancamentos", [custo({ etapa: "03", fornecedor_cliente: "Cimento Forte", documento: "NF 9" })]), ref);
    expect(p.erros).toEqual([]);
    expect(p.lidas).toBe(1);
    expect(p.validas).toBe(1);
    expect(p.lancamentos[0]).toMatchObject({
      linha: 2,
      obraId: OBRA,
      etapaId: ETAPA_03,
      categoriaId: CAT_MATERIAL,
      tipo: "custo",
      situacao: "realizado", // deduzida: há data de pagamento
      classe: "operacional",
      isPrevisao: false,
      valorCentavos: 123456,
      dataCompetencia: "2026-03-10",
      dataLiquidacao: "2026-03-12",
      contraparte: "Cimento Forte",
    });
  });

  it("deduz a realizar quando não há pagamento e exige vencimento", () => {
    const sem = montarPrevia(folha("lancamentos", [custo({ data_pagamento: "" })]), ref);
    expect(sem.erros).toEqual([
      expect.objectContaining({ linha: 2, coluna: "vencimento", mensagem: "Informe o vencimento (situação a_realizar)" }),
    ]);

    const com = montarPrevia(folha("lancamentos", [custo({ data_pagamento: "", vencimento: "20/04/2026", previsao: "sim" })]), ref);
    expect(com.erros).toEqual([]);
    expect(com.lancamentos[0]).toMatchObject({ situacao: "a_realizar", isPrevisao: true, dataVencimento: "2026-04-20" });
  });

  it("aceita sinônimos e aceita acentos/caixa em obra, categoria e tipo", () => {
    const p = montarPrevia(
      folha("lancamentos", [custo({ codigo_obra: " aur-001 ", categoria: "MATERIAIS DE CONSTRUCAO", tipo: "Despesa", classe: "Devolução de sócio" })]),
      ref,
    );
    expect(p.erros).toEqual([]);
    expect(p.lancamentos[0]).toMatchObject({ obraId: OBRA, categoriaId: CAT_MATERIAL, tipo: "custo", classe: "devolucao_socio" });
  });

  it("reporta cada problema na linha e coluna certas, com o valor original", () => {
    const p = montarPrevia(
      folha("lancamentos", [
        custo(), // ok
        custo({ valor: "abc" }),
        custo({ data: "31/02/2026" }),
        custo({ codigo_obra: "NAO-EXISTE" }),
        custo({ categoria: "Inventada" }),
        custo({ etapa: "99" }),
        custo({ tipo: "talvez" }),
        custo({ valor: 0 }),
        custo({ categoria: "" }),
      ]),
      ref,
    );
    expect(p.lidas).toBe(9);
    expect(p.validas).toBe(1);
    expect(p.lancamentos).toHaveLength(1);

    const por = (linha: number) => p.erros.filter((e) => e.linha === linha);
    expect(por(3)).toEqual([expect.objectContaining({ coluna: "valor", valor: "abc", mensagem: "Valor inválido: use números como 1234,56" })]);
    expect(por(4)[0]).toMatchObject({ coluna: "data", valor: "31/02/2026" });
    expect(por(5)[0]).toMatchObject({ coluna: "codigo_obra", mensagem: 'Obra "NAO-EXISTE" não encontrada nesta empresa' });
    expect(por(6)[0]).toMatchObject({ coluna: "categoria", mensagem: 'Categoria "Inventada" não cadastrada para esta empresa' });
    expect(por(7)[0]).toMatchObject({ coluna: "etapa", mensagem: 'Etapa "99" não encontrada nesta obra' });
    expect(por(8)[0]).toMatchObject({ coluna: "tipo" });
    expect(por(9)[0]).toMatchObject({ coluna: "valor", mensagem: "O valor não pode ser zero" });
    expect(por(10)[0]).toMatchObject({ coluna: "categoria", mensagem: "Informe a categoria" });
  });

  it("uma linha com vários problemas gera vários erros, mas conta como uma linha inválida", () => {
    const p = montarPrevia(folha("lancamentos", [custo({ valor: "x", data: "y", tipo: "z" })]), ref);
    expect(p.erros.length).toBeGreaterThanOrEqual(3);
    expect(p.validas).toBe(0);
    expect(p.lidas).toBe(1);
  });

  it("id_externo repetido no arquivo é erro na segunda ocorrência", () => {
    const p = montarPrevia(folha("lancamentos", [custo({ id_externo: "A1" }), custo({ id_externo: "A1" })]), ref);
    expect(p.lancamentos).toHaveLength(1);
    expect(p.erros).toEqual([
      expect.objectContaining({ linha: 3, coluna: "id_externo", mensagem: "id_externo repetido (já usado na linha 2)" }),
    ]);
  });

  describe("chave de idempotência (id_origem)", () => {
    const ids = (linhas: Record<string, unknown>[]) => montarPrevia(folha("lancamentos", linhas), ref).lancamentos.map((l) => l.idOrigem);

    it("com id_externo: usa o próprio id", () => {
      expect(ids([custo({ id_externo: "NF-1" })])).toEqual(["x:NF-1"]);
    });

    it("sem id_externo: o mesmo conteúdo gera o mesmo id (reimportar não duplica)", () => {
      expect(ids([custo()])).toEqual(ids([custo()]));
    });

    it("conteúdo diferente gera ids diferentes", () => {
      const [a] = ids([custo()]);
      expect(ids([custo({ valor: "1.234,57" })])[0]).not.toBe(a);
      expect(ids([custo({ data: "11/03/2026" })])[0]).not.toBe(a);
      expect(ids([custo({ documento: "NF 2" })])[0]).not.toBe(a);
    });

    it("duas linhas idênticas no mesmo arquivo continuam sendo duas (ocorrência 1 e 2)", () => {
      const [a, b] = ids([custo(), custo()]);
      expect(a).not.toBe(b);
      expect(a).toMatch(/#1$/);
      expect(b).toMatch(/#2$/);
      // E reimportando, ocorrem os mesmos ids.
      expect(ids([custo(), custo()])).toEqual([a, b]);
    });

    it("a ordem das linhas não muda os ids de linhas distintas", () => {
      const x = custo({ valor: "10,00" });
      const y = custo({ valor: "20,00" });
      const [x1, y1] = ids([x, y]);
      const [y2, x2] = ids([y, x]);
      expect(x1).toBe(x2);
      expect(y1).toBe(y2);
    });
  });
});

describe("montarPrevia: orçamento", () => {
  it("valida e resolve; o valor fica fora da chave (reimportar com valor novo atualiza)", () => {
    const linha = { codigo_obra: "AUR-001", etapa: "03", categoria: "Materiais de construção", valor_previsto: "250.000,00", descricao: "Estrutura" };
    const p = montarPrevia(folha("orcamento", [linha]), ref);
    expect(p.erros).toEqual([]);
    expect(p.orcamento[0]).toMatchObject({ obraId: OBRA, etapaId: ETAPA_03, categoriaId: CAT_MATERIAL, valorPrevistoCentavos: 25_000_000, versao: 1 });

    const p2 = montarPrevia(folha("orcamento", [{ ...linha, valor_previsto: "300.000,00" }]), ref);
    expect(p2.orcamento[0]!.idOrigem).toBe(p.orcamento[0]!.idOrigem);
  });

  it("recusa valor negativo e versão inválida", () => {
    const p = montarPrevia(
      folha("orcamento", [
        { codigo_obra: "AUR-001", valor_previsto: "-1" },
        { codigo_obra: "AUR-001", valor_previsto: "10", versao: 0 },
        { codigo_obra: "AUR-001" },
      ]),
      ref,
    );
    expect(p.orcamento).toHaveLength(0);
    expect(p.erros.map((e) => e.mensagem)).toEqual([
      "O valor previsto não pode ser negativo",
      "A versão deve ser de 1 a 999",
      "Informe o valor previsto",
    ]);
  });
});

describe("montarPrevia: avanço físico", () => {
  const av = (extra: Record<string, unknown> = {}) => ({ codigo_obra: "AUR-001", competencia: "03/2026", tipo: "realizado", pct_mes: "4,5", pct_acum: "35", ...extra });

  it("converte percentuais em pontos-base e a competência no dia 1", () => {
    const p = montarPrevia(folha("avanco", [av()]), ref);
    expect(p.erros).toEqual([]);
    expect(p.avanco[0]).toMatchObject({ obraId: OBRA, competencia: "2026-03-01", tipo: "realizado", versao: 0, pctMesBps: 450, pctAcumBps: 3500 });
  });

  it("recusa acumulado menor que o mês, percentual > 100 e mês repetido", () => {
    const p = montarPrevia(folha("avanco", [av({ pct_acum: "2" }), av({ pct_mes: "101" }), av(), av()]), ref);
    expect(p.avanco).toHaveLength(1);
    expect(p.erros.map((e) => [e.linha, e.coluna])).toEqual([
      [2, "pct_acum"],
      [3, "pct_mes"],
      [5, "competencia"],
    ]);
  });
});

describe("montarPrevia: problemas de arquivo", () => {
  it("coluna obrigatória ausente: erro no cabeçalho e linhas não são processadas", () => {
    const p = montarPrevia(folha("lancamentos", [custo()], { colunasAusentes: ["valor"] }), ref);
    expect(p.erros).toEqual([expect.objectContaining({ linha: 1, coluna: "valor", mensagem: 'Coluna obrigatória "valor" não encontrada no cabeçalho' })]);
    expect(p.lancamentos).toHaveLength(0);
    expect(p.lidas).toBe(0);
  });

  it("colunas ignoradas viram aviso; erros do arquivo viram erro de linha 0", () => {
    const arquivo = folha("lancamentos", [custo()], { colunasIgnoradas: ["Coluna Extra"] });
    arquivo.erros.push("Arquivo com problema");
    const p = montarPrevia(arquivo, ref);
    expect(p.avisos[0]).toMatch(/Coluna Extra/);
    expect(p.erros[0]).toMatchObject({ aba: "Arquivo", linha: 0, mensagem: "Arquivo com problema" });
    expect(p.lancamentos).toHaveLength(1);
  });

  it("várias abas no mesmo arquivo", () => {
    const a = folha("lancamentos", [custo()]);
    const b = folha("avanco", [{ codigo_obra: "AUR-001", competencia: "03/2026", tipo: "planejado", pct_mes: "1", pct_acum: "1" }]);
    const p = montarPrevia({ erros: [], folhas: [...a.folhas, ...b.folhas] }, ref);
    expect(p.lancamentos).toHaveLength(1);
    expect(p.avanco).toHaveLength(1);
    expect(p.lidas).toBe(2);
    expect(p.validas).toBe(2);
  });
});
