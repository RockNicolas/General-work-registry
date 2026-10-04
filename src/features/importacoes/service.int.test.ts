import ExcelJS from "exceljs";
import { and, count, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ActionError } from "@/lib/action-result";
import { getDb, getPool } from "@/server/db/client";
import { friendlyDbError } from "@/server/db/errors";
import { auditoria, avancoFisico, etapa, importacao, importacaoErro, lancamento, orcamento } from "@/server/db/schema";
import { createTenantFixture, type TenantFixture } from "@/test/fixtures";
import {
  cancelarImportacao,
  confirmarImportacao,
  criarPrevia,
  listarImportacoes,
  obterImportacao,
} from "./service";

let fx: TenantFixture;

beforeAll(async () => {
  fx = await createTenantFixture();
  // Etapa "03" na obra A-1 para os testes que referenciam etapa.
  await getDb().insert(etapa).values({ empresaId: fx.ids.empresaA, obraId: fx.obraId["A-1"], codigo: "03", nome: "Estrutura" });
});

afterAll(async () => {
  const db = getDb();
  const empresas = [fx.ids.empresaA, fx.ids.empresaB];
  await db.delete(auditoria).where(inArray(auditoria.empresaId, empresas));
  await db.delete(lancamento).where(inArray(lancamento.empresaId, empresas)); // antes das importações (FK)
  await db.delete(importacao).where(inArray(importacao.empresaId, [fx.ids.empresaA, fx.ids.empresaB]));
  await fx?.cleanup();
  await getPool().end();
});

const admin = () => fx.ctx.admin;
const bytes = (texto: string) => new TextEncoder().encode(texto);

const CABECALHO = "codigo_obra;tipo;data;valor;categoria;etapa;data_pagamento;vencimento;id_externo;fornecedor_cliente;documento;descricao";
const csvLanc = (...linhas: string[]) => bytes([CABECALHO, ...linhas].join("\r\n") + "\r\n");

const prever = (arquivo: Uint8Array, nome = "dados.csv", dataset: "lancamentos" | "orcamento" | "avanco" = "lancamentos", empresaId = fx.ids.empresaA) =>
  criarPrevia(admin(), { empresaId, arquivoNome: nome, bytes: arquivo, datasetCsv: dataset });

const lancamentosDaObra = (obraId: string) =>
  getDb().select().from(lancamento).where(and(eq(lancamento.obraId, obraId), eq(lancamento.origem, "planilha")));

describe("prévia (nada é gravado antes de confirmar)", () => {
  it("valida, guarda a prévia e NÃO toca nos lançamentos", async () => {
    const antes = (await lancamentosDaObra(fx.obraId["A-1"])).length;
    const { id } = await prever(
      csvLanc(
        "A-1;custo;10/03/2026;1.234,56;Cimento;03;12/03/2026;;;Cimento Forte;NF 1;compra",
        "A-1;receita;31/03/2026;5.000,00;Cimento;;;20/04/2026;;Contratante;MED 1;medição",
      ),
    );

    const d = (await obterImportacao(admin(), id))!;
    expect(d).toMatchObject({ status: "previa", total: 2, ok: 2, comErro: 0, arquivoNome: "dados.csv", usuarioNome: "admin" });
    expect(d.contagens).toEqual({ lancamentos: 2, orcamento: 0, avanco: 0 });
    expect(d.amostra.lancamentos[0]).toMatchObject({ valorCentavos: 123456, tipo: "custo", situacao: "realizado" });
    expect(d.rotulos.obras[fx.obraId["A-1"]]).toBe("A-1");
    expect(d.erros).toEqual([]);
    expect(d.jaImportadoEm).toBeNull();

    expect((await lancamentosDaObra(fx.obraId["A-1"])).length).toBe(antes);
  });

  it("mostra os erros por linha (aba, linha, coluna, valor, problema) e conta as linhas inválidas", async () => {
    const { id } = await prever(
      csvLanc(
        "A-1;custo;10/03/2026;100,00;Cimento;;12/03/2026;;;;;ok",
        "A-1;custo;31/02/2026;100,00;Cimento;;12/03/2026;;;;;data ruim",
        "A-1;custo;10/03/2026;abc;Cimento;;12/03/2026;;;;;valor ruim",
        "NAO-EXISTE;custo;10/03/2026;100,00;Cimento;;12/03/2026;;;;;obra ruim",
        "A-1;custo;10/03/2026;100,00;Inventada;;12/03/2026;;;;;categoria ruim",
        "A-1;custo;10/03/2026;100,00;Cimento;99;12/03/2026;;;;;etapa ruim",
        "B-1;custo;10/03/2026;100,00;Cimento;;12/03/2026;;;;;obra de outra empresa",
      ),
    );
    const d = (await obterImportacao(admin(), id))!;
    expect(d).toMatchObject({ status: "previa", total: 7, ok: 1, comErro: 6 });
    expect(d.errosTotal).toBe(6);
    expect(d.erros.map((e) => [e.linha, e.coluna, e.valor])).toEqual([
      [3, "data", "31/02/2026"],
      [4, "valor", "abc"],
      [5, "codigo_obra", "NAO-EXISTE"],
      [6, "categoria", "Inventada"],
      [7, "etapa", "99"],
      [8, "codigo_obra", "B-1"],
    ]);
    expect(d.erros.every((e) => e.aba === "CSV")).toBe(true);
  });

  it("sem nenhuma linha válida a importação 'falhou' e não pode ser confirmada", async () => {
    const { id } = await prever(csvLanc("A-1;custo;10/03/2026;abc;Cimento;;12/03/2026;;;;;ruim"));
    const d = (await obterImportacao(admin(), id))!;
    expect(d.status).toBe("falhou");
    const erro = await confirmarImportacao(admin(), id).catch((e) => e);
    expect(erro).toBeInstanceOf(ActionError);
  });

  it("coluna obrigatória ausente e arquivo ilegível viram erros, sem estourar", async () => {
    const semValor = bytes("codigo_obra;tipo;data;categoria\r\nA-1;custo;10/03/2026;Cimento\r\n");
    const d1 = (await obterImportacao(admin(), (await prever(semValor)).id))!;
    expect(d1.status).toBe("falhou");
    expect(d1.erros[0]).toMatchObject({ coluna: "valor", mensagem: 'Coluna obrigatória "valor" não encontrada no cabeçalho' });

    const d2 = (await obterImportacao(admin(), (await prever(bytes("lixo"), "x.xlsx")).id))!;
    expect(d2.status).toBe("falhou");
    expect(d2.erros[0]!.mensagem).toMatch(/Não foi possível abrir/);
  });

  it("empresa inexistente é recusada", async () => {
    const erro = await prever(csvLanc("A-1;custo;10/03/2026;1,00;Cimento;;11/03/2026;;;;;x"), "x.csv", "lancamentos", "nao-existe").catch((e) => e);
    expect(erro).toBeInstanceOf(ActionError);
  });
});

describe("confirmação e idempotência", () => {
  const arquivo = () =>
    csvLanc(
      "A-1;custo;10/03/2026;1.000,00;Cimento;03;12/03/2026;;;Fornecedor A;NF 10;sem id 1",
      "A-1;custo;11/03/2026;2.000,00;Cimento;;13/03/2026;;;Fornecedor B;NF 11;sem id 2",
      "A-1;custo;11/03/2026;2.000,00;Cimento;;13/03/2026;;;Fornecedor B;NF 11;sem id 2", // idêntica à anterior
      "A-1;receita;31/03/2026;9.000,00;Cimento;;;20/04/2026;;Contratante;MED 3;a receber",
    );

  it("grava na confirmação; reimportar o mesmo arquivo não duplica nada", async () => {
    const base = (await lancamentosDaObra(fx.obraId["A-1"])).length;

    const primeira = await prever(arquivo(), "marco.csv");
    const resumo1 = await confirmarImportacao(admin(), primeira.id);
    expect(resumo1.lancamentos).toEqual({ inseridos: 4, atualizados: 0, inalterados: 0 }); // as duas idênticas continuam duas
    expect((await lancamentosDaObra(fx.obraId["A-1"])).length).toBe(base + 4);

    const gravado = (await lancamentosDaObra(fx.obraId["A-1"])).find((l) => l.descricao === "a receber")!;
    expect(gravado).toMatchObject({ tipo: "receita", situacao: "a_realizar", origem: "planilha", dataVencimento: "2026-04-20", valorCentavos: 900_000, importacaoId: primeira.id });
    const dp = (await obterImportacao(admin(), primeira.id))!;
    expect(dp.status).toBe("concluida");
    expect(dp.resumo?.lancamentos?.inseridos).toBe(4);

    // Reimporta o MESMO arquivo.
    const segunda = await prever(arquivo(), "marco-de-novo.csv");
    expect((await obterImportacao(admin(), segunda.id))!.jaImportadoEm).not.toBeNull();
    const resumo2 = await confirmarImportacao(admin(), segunda.id);
    expect(resumo2.lancamentos).toEqual({ inseridos: 0, atualizados: 0, inalterados: 4 });
    expect((await lancamentosDaObra(fx.obraId["A-1"])).length).toBe(base + 4);
  });

  it("com id_externo, reimportar ATUALIZA a linha em vez de criar outra", async () => {
    const linha = (valor: string, desc: string) => `A-1;custo;10/04/2026;${valor};Cimento;;12/04/2026;;NF-ID-77;Forn;NF 77;${desc}`;
    await confirmarImportacao(admin(), (await prever(csvLanc(linha("100,00", "v1")))).id);
    const r = await confirmarImportacao(admin(), (await prever(csvLanc(linha("250,00", "v2")))).id);
    expect(r.lancamentos).toEqual({ inseridos: 0, atualizados: 1, inalterados: 0 });

    const rows = (await lancamentosDaObra(fx.obraId["A-1"])).filter((l) => l.idOrigem === "x:NF-ID-77");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ valorCentavos: 25_000, descricao: "v2" });
  });

  it("com erros, importa só as linhas válidas e termina 'concluída com erros'", async () => {
    const { id } = await prever(
      csvLanc(
        "A-2;custo;05/05/2026;10,00;Cimento;;06/05/2026;;;;;boa 1",
        "A-2;custo;32/05/2026;10,00;Cimento;;06/05/2026;;;;;ruim",
        "A-2;custo;07/05/2026;20,00;Cimento;;08/05/2026;;;;;boa 2",
      ),
    );
    const resumo = await confirmarImportacao(admin(), id);
    expect(resumo.lancamentos?.inseridos).toBe(2);
    expect((await obterImportacao(admin(), id))!).toMatchObject({ status: "concluida_com_erros", comErro: 1 });
    expect((await lancamentosDaObra(fx.obraId["A-2"])).map((l) => l.descricao).sort()).toEqual(["boa 1", "boa 2"]);
  });

  it("duas confirmações simultâneas: só uma grava, a outra é recusada", async () => {
    const { id } = await prever(csvLanc("A-2;custo;15/06/2026;77,00;Cimento;;16/06/2026;;;;;concorrente"));
    const resultados = await Promise.allSettled([confirmarImportacao(admin(), id), confirmarImportacao(admin(), id)]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejeitado = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejeitado.reason).toBeInstanceOf(ActionError);
    const rows = (await lancamentosDaObra(fx.obraId["A-2"])).filter((l) => l.descricao === "concorrente");
    expect(rows).toHaveLength(1);
  });

  it("é tudo ou nada: se uma linha falha na gravação, NADA fica gravado e a importação 'falha'", async () => {
    const { id } = await prever(csvLanc("A-2;custo;20/07/2026;11,00;Cimento;;21/07/2026;;;;;atomico 1", "A-2;custo;22/07/2026;12,00;Cimento;;23/07/2026;;;;;atomico 2"));
    // Sabota o payload: uma obra que não existe, no meio das linhas boas.
    const [imp] = await getDb().select({ payload: importacao.payload }).from(importacao).where(eq(importacao.id, id));
    const payload = imp!.payload as { lancamentos: { obraId: string }[] };
    payload.lancamentos.splice(1, 0, { ...payload.lancamentos[0]!, obraId: "99999999-9999-4999-8999-999999999999", idOrigem: "h:sabotado#1" } as never);
    await getDb().update(importacao).set({ payload }).where(eq(importacao.id, id));

    await expect(confirmarImportacao(admin(), id)).rejects.toThrow();
    expect((await lancamentosDaObra(fx.obraId["A-2"])).filter((l) => l.descricao?.startsWith("atomico"))).toHaveLength(0);
    const d = (await obterImportacao(admin(), id))!;
    expect(d.status).toBe("falhou");
    expect(d.resumo?.erro).toMatch(/nada foi alterado/);
  });
});

describe("orçamento e avanço físico", () => {
  const csv = (cab: string, ...linhas: string[]) => bytes([cab, ...linhas].join("\r\n") + "\r\n");

  it("orçamento: reimportar com valor novo atualiza; versão nova aposenta a anterior", async () => {
    const cab = "codigo_obra;etapa;categoria;valor_previsto;versao;descricao";
    const v1 = (valor: string) => csv(cab, `A-1;03;Cimento;${valor};1;Estrutura`);
    const itens = () => getDb().select().from(orcamento).where(and(eq(orcamento.obraId, fx.obraId["A-1"]), eq(orcamento.origem, "planilha")));

    const r1 = await confirmarImportacao(admin(), (await prever(v1("100.000,00"), "orc.csv", "orcamento")).id);
    expect(r1.orcamento).toEqual({ inseridos: 1, atualizados: 0, inalterados: 0 });
    const r2 = await confirmarImportacao(admin(), (await prever(v1("120.000,00"), "orc.csv", "orcamento")).id);
    expect(r2.orcamento).toEqual({ inseridos: 0, atualizados: 1, inalterados: 0 });
    expect((await itens()).map((i) => i.valorPrevistoCentavos)).toEqual([12_000_000]);

    const v2 = csv(cab, "A-1;03;Cimento;150.000,00;2;Estrutura");
    await confirmarImportacao(admin(), (await prever(v2, "orc2.csv", "orcamento")).id);
    const todos = await itens();
    expect(todos).toHaveLength(2);
    expect(todos.find((i) => i.versao === 1)!.vigente).toBe(false);
    expect(todos.find((i) => i.versao === 2)!.vigente).toBe(true);
  });

  it("avanço: reimportar o mesmo mês/tipo/versão atualiza", async () => {
    const cab = "codigo_obra;competencia;tipo;versao;pct_mes;pct_acum";
    const arquivo = (mes: string, acum: string) => csv(cab, `A-1;03/2026;realizado;0;${mes};${acum}`);
    const r1 = await confirmarImportacao(admin(), (await prever(arquivo("4,5", "35"), "av.csv", "avanco")).id);
    expect(r1.avanco).toEqual({ inseridos: 1, atualizados: 0, inalterados: 0 });
    const r2 = await confirmarImportacao(admin(), (await prever(arquivo("5", "36"), "av.csv", "avanco")).id);
    expect(r2.avanco).toEqual({ inseridos: 0, atualizados: 1, inalterados: 0 });
    const r3 = await confirmarImportacao(admin(), (await prever(arquivo("5", "36"), "av.csv", "avanco")).id);
    expect(r3.avanco).toEqual({ inseridos: 0, atualizados: 0, inalterados: 1 });

    const rows = await getDb().select().from(avancoFisico).where(eq(avancoFisico.obraId, fx.obraId["A-1"]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ competencia: "2026-03-01", pctMesBps: 500, pctAcumBps: 3600 });
  });
});

describe("planilha .xlsx", () => {
  it("importa datas do Excel, números e várias abas de uma vez", async () => {
    const wb = new ExcelJS.Workbook();
    const l = wb.addWorksheet("Lancamentos");
    l.addRow(["codigo_obra", "tipo", "data", "valor", "categoria", "data_pagamento", "descricao"]);
    l.addRow(["A-1", "custo", new Date(Date.UTC(2026, 7, 10)), 4321.09, "Cimento", new Date(Date.UTC(2026, 7, 12)), "xlsx lanc"]);
    const a = wb.addWorksheet("AvancoFisico");
    a.addRow(["codigo_obra", "competencia", "tipo", "pct_mes", "pct_acum"]);
    const linha = a.addRow(["A-1", "08/2026", "planejado", 0.05, 0.4]);
    linha.getCell(4).numFmt = "0.0%";
    linha.getCell(5).numFmt = "0%";

    const arquivo = new Uint8Array(await wb.xlsx.writeBuffer());
    const { id } = await criarPrevia(admin(), { empresaId: fx.ids.empresaA, arquivoNome: "modelo.xlsx", bytes: arquivo });
    const d = (await obterImportacao(admin(), id))!;
    expect(d.erros).toEqual([]);
    expect(d.contagens).toEqual({ lancamentos: 1, orcamento: 0, avanco: 1 });

    await confirmarImportacao(admin(), id);
    const lanc = (await lancamentosDaObra(fx.obraId["A-1"])).find((x) => x.descricao === "xlsx lanc")!;
    expect(lanc).toMatchObject({ valorCentavos: 432_109, dataCompetencia: "2026-08-10", dataLiquidacao: "2026-08-12" });
    const av = (await getDb().select().from(avancoFisico).where(and(eq(avancoFisico.obraId, fx.obraId["A-1"]), eq(avancoFisico.tipo, "planejado"))))[0]!;
    expect(av).toMatchObject({ competencia: "2026-08-01", pctMesBps: 500, pctAcumBps: 4000 });
  });
});

describe("volume", () => {
  it("importa milhares de linhas (em lotes) e reimporta sem duplicar", async () => {
    const N = 3000;
    const linhas = Array.from({ length: N }, (_, i) => `A-2;custo;${String((i % 28) + 1).padStart(2, "0")}/08/2026;${(i + 1) * 3},50;Cimento;;02/09/2026;;VOL-${i};Forn ${i % 7};NF ${i};carga`);
    const arquivo = csvLanc(...linhas);

    const t0 = Date.now();
    const r1 = await confirmarImportacao(admin(), (await prever(arquivo, "carga.csv")).id);
    expect(r1.lancamentos?.inseridos).toBe(N);
    expect(Date.now() - t0).toBeLessThan(20_000);

    const r2 = await confirmarImportacao(admin(), (await prever(arquivo, "carga.csv")).id);
    expect(r2.lancamentos).toEqual({ inseridos: 0, atualizados: 0, inalterados: N });
    const [contagem] = await getDb().select({ n: count() }).from(lancamento).where(and(eq(lancamento.obraId, fx.obraId["A-2"]), eq(lancamento.descricao, "carga")));
    expect(contagem!.n).toBe(N);
  });

  it("guarda no máximo 1000 erros, mas informa o total", async () => {
    const linhas = Array.from({ length: 1200 }, () => "A-1;custo;99/99/2026;1,00;Cimento;;;;;;;ruim");
    const { id } = await prever(csvLanc(...linhas));
    const d = (await obterImportacao(admin(), id))!;
    expect(d.errosTotal).toBe(1200);
    expect(d.erros).toHaveLength(1000);
    const [guardados] = await getDb().select({ n: count() }).from(importacaoErro).where(eq(importacaoErro.importacaoId, id));
    expect(guardados!.n).toBe(1000);
  });
});

describe("cancelar, permissões e auditoria", () => {
  it("descarta prévia; não descarta importação já concluída", async () => {
    const { id } = await prever(csvLanc("A-1;custo;01/09/2026;1,00;Cimento;;02/09/2026;;;;;descartar"));
    await cancelarImportacao(admin(), id);
    expect(await obterImportacao(admin(), id)).toBeNull();

    const concluida = await prever(csvLanc("A-1;custo;01/09/2026;2,00;Cimento;;02/09/2026;;;;;manter"));
    await confirmarImportacao(admin(), concluida.id);
    expect(await cancelarImportacao(admin(), concluida.id).catch((e) => e)).toBeInstanceOf(ActionError);
  });

  it("empresa e cliente não veem nem criam importações", async () => {
    const { id } = await prever(csvLanc("A-1;custo;01/09/2026;3,00;Cimento;;02/09/2026;;;;;privado"));
    for (const quem of ["empresaA", "clienteA", "empresaB"] as const) {
      expect(await obterImportacao(fx.ctx[quem], id), quem).toBeNull();
      expect((await listarImportacoes(fx.ctx[quem])).filter((i) => i.id === id), quem).toEqual([]);
    }
    const erro = await criarPrevia(fx.ctx.empresaA, { empresaId: fx.ids.empresaA, arquivoNome: "x.csv", bytes: csvLanc("A-1;custo;01/09/2026;1,00;Cimento;;02/09/2026;;;;;x"), datasetCsv: "lancamentos" }).catch((e) => e);
    expect(friendlyDbError(erro)).toBe("Sem permissão para esta operação.");
  });

  it("a confirmação fica na auditoria, com quem fez e as contagens", async () => {
    const { id } = await prever(csvLanc("A-1;custo;03/09/2026;4,00;Cimento;;04/09/2026;;;;;auditada"));
    await confirmarImportacao(admin(), id);
    const eventos = await getDb().select().from(auditoria).where(and(eq(auditoria.entidade, "importacao"), eq(auditoria.entidadeId, id)));
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ acao: "importar", usuarioNome: "admin" });
    expect(eventos[0]!.resumo).toMatch(/1 novos, 0 atualizados, 0 sem mudança/);
  });
});
