import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { gerarModeloCsv, gerarModeloXlsx } from "./gerar-modelo";
import { lerArquivo } from "./ler-arquivo";
import { DATASETS, MODELO } from "./modelo";

describe("gerarModeloXlsx", () => {
  it("gera instruções + uma aba por conjunto, com os cabeçalhos do modelo", async () => {
    const bytes = await gerarModeloXlsx();
    expect(bytes[0]).toBe(0x50); // ZIP
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);

    expect(wb.worksheets.map((w) => w.name)).toEqual(["Instruções", "Lancamentos", "Orcamento", "AvancoFisico"]);
    for (const d of DATASETS) {
      const ws = wb.getWorksheet(MODELO[d].aba)!;
      const cabecalho = (ws.getRow(1).values as (string | undefined)[]).slice(1);
      expect(cabecalho).toEqual(MODELO[d].colunas.map((c) => c.chave));
      // Modelo VAZIO: nenhuma célula de dados tem valor (as listas suspensas são só validação).
      const valores = [2, 3, 50].flatMap((r) => (ws.getRow(r).values as unknown[]).slice(1)).filter((v) => v !== undefined && v !== null);
      expect(valores).toEqual([]);
    }
  });

  it("o próprio modelo é lido pelo importador (sem linhas, sem colunas ausentes)", async () => {
    const r = lerArquivo(await gerarModeloXlsx(), "modelo.xlsx");
    expect(r.erros).toEqual([]);
    expect(r.folhas.map((f) => f.dataset).sort()).toEqual(["avanco", "lancamentos", "orcamento"]);
    for (const f of r.folhas) {
      expect(f.colunasAusentes).toEqual([]);
      expect(f.colunasIgnoradas).toEqual([]);
      expect(f.linhas).toEqual([]);
    }
  });

  it("tem listas suspensas nas colunas de valores fixos", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await gerarModeloXlsx()) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Lancamentos")!;
    const colunaTipo = MODELO.lancamentos.colunas.findIndex((c) => c.chave === "tipo") + 1;
    expect(ws.getCell(2, colunaTipo).dataValidation).toMatchObject({ type: "list", formulae: ['"custo,receita"'] });
  });
});

describe("gerarModeloCsv", () => {
  it("é só o cabeçalho, com ; e BOM, e é lido de volta", () => {
    const bytes = gerarModeloCsv("lancamentos");
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const texto = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(texto).toBe(`﻿${MODELO.lancamentos.colunas.map((c) => c.chave).join(";")}\r\n`);

    const r = lerArquivo(bytes, "modelo.csv", "lancamentos");
    expect(r.folhas[0]!.colunasAusentes).toEqual([]);
    expect(r.folhas[0]!.linhas).toEqual([]);
  });
});
