import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { LIMITE_BYTES, lerArquivo } from "./ler-arquivo";

async function xlsx(montar: (wb: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  montar(wb);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const bytes = (texto: string) => new TextEncoder().encode(texto);

describe("lerArquivo (.xlsx)", () => {
  it("lê as abas do modelo, com datas, números e porcentagem formatada do Excel", async () => {
    const arquivo = await xlsx((wb) => {
      wb.addWorksheet("Instruções").addRow(["leia isto"]);

      const l = wb.addWorksheet("Lancamentos");
      l.addRow(["codigo_obra", "tipo", "data", "valor", "categoria", "situacao"]);
      l.addRow(["AUR-001", "custo", new Date(Date.UTC(2026, 2, 10)), 1234.56, "Materiais", "realizado"]);
      l.addRow([]); // linha em branco: ignorada
      l.addRow(["AUR-001", "receita", "15/03/2026", "2.500,00", "Medições", null]);

      const a = wb.addWorksheet("Avanço Físico");
      a.addRow(["codigo_obra", "competencia", "tipo", "pct_mes", "pct_acum"]);
      const linha = a.addRow(["AUR-001", "03/2026", "realizado", 0.125, 0.4]);
      linha.getCell(4).numFmt = "0.0%"; // 12,5%
      linha.getCell(5).numFmt = "0%"; // 40%
    });

    const r = lerArquivo(arquivo, "dados.xlsx");
    expect(r.erros).toEqual([]);
    expect(r.folhas.map((f) => f.dataset).sort()).toEqual(["avanco", "lancamentos"]);

    const lanc = r.folhas.find((f) => f.dataset === "lancamentos")!;
    expect(lanc.colunasAusentes).toEqual([]);
    expect(lanc.linhas).toHaveLength(2);
    expect(lanc.linhas[0]!.numero).toBe(2); // número da linha na planilha
    expect(lanc.linhas[1]!.numero).toBe(4);
    expect(lanc.linhas[0]!.valores).toMatchObject({ codigo_obra: "AUR-001", valor: 1234.56 });
    expect(typeof lanc.linhas[0]!.valores.data).toBe("number"); // serial do Excel
    expect(lanc.linhas[1]!.valores.valor).toBe("2.500,00");

    const av = r.folhas.find((f) => f.dataset === "avanco")!;
    expect(av.linhas[0]!.valores.pct_mes).toBeCloseTo(12.5, 6);
    expect(av.linhas[0]!.valores.pct_acum).toBeCloseTo(40, 6);
  });

  it("aceita cabeçalhos com acento, caixa e apelidos, e uma linha de título acima", async () => {
    const arquivo = await xlsx((wb) => {
      const ws = wb.addWorksheet("Lançamentos");
      ws.addRow(["Relatório de custos"]);
      ws.addRow([]);
      ws.addRow(["Obra", "Tipo", "Competência", "Valor R$", "Categoria", "Fornecedor", "Coluna Extra"]);
      ws.addRow(["AUR-001", "custo", "10/03/2026", 100, "Materiais", "Cimento Forte", "x"]);
    });
    const r = lerArquivo(arquivo, "x.xlsx");
    const f = r.folhas[0]!;
    expect(f.colunasAusentes).toEqual([]);
    expect(f.colunasIgnoradas).toEqual(["Coluna Extra"]);
    expect(f.linhas[0]).toMatchObject({
      numero: 4,
      valores: { codigo_obra: "AUR-001", data: "10/03/2026", valor: 100, fornecedor_cliente: "Cimento Forte" },
    });
  });

  it("informa as colunas obrigatórias que faltam", async () => {
    const arquivo = await xlsx((wb) => {
      const ws = wb.addWorksheet("Lancamentos");
      ws.addRow(["codigo_obra", "tipo", "data", "categoria"]); // sem valor
      ws.addRow(["AUR-001", "custo", "10/03/2026", "Materiais"]);
    });
    const f = lerArquivo(arquivo, "x.xlsx").folhas[0]!;
    expect(f.colunasAusentes).toEqual(["valor"]);
  });

  it("sem aba reconhecida, explica como corrigir", async () => {
    const arquivo = await xlsx((wb) => wb.addWorksheet("Planilha1").addRow(["a", "b"]));
    expect(lerArquivo(arquivo, "x.xlsx").erros[0]).toMatch(/Nenhuma aba reconhecida/);
  });

  it("aba sem cabeçalho reconhecível: todas as obrigatórias ausentes", async () => {
    const arquivo = await xlsx((wb) => wb.addWorksheet("Orcamento").addRow(["foo", "bar"]));
    const f = lerArquivo(arquivo, "x.xlsx").folhas[0]!;
    expect(f.colunasAusentes).toEqual(["codigo_obra", "valor_previsto"]);
  });

  it("marca células com erro de fórmula", async () => {
    const arquivo = await xlsx((wb) => {
      const ws = wb.addWorksheet("Orcamento");
      ws.addRow(["codigo_obra", "valor_previsto"]);
      ws.addRow(["AUR-001", { error: "#DIV/0!" } as ExcelJS.CellErrorValue]);
    });
    const f = lerArquivo(arquivo, "x.xlsx").folhas[0]!;
    expect(String(f.linhas[0]!.valores.valor_previsto)).toMatch(/^#ERRO\(/);
  });

  it("rejeita arquivo corrompido, vazio, grande demais e formato .xls", () => {
    expect(lerArquivo(bytes("isso não é um zip"), "x.xlsx").erros[0]).toMatch(/Não foi possível abrir/);
    expect(lerArquivo(new Uint8Array(), "x.xlsx").erros[0]).toMatch(/vazio/);
    expect(lerArquivo(new Uint8Array(LIMITE_BYTES + 1), "x.xlsx").erros[0]).toMatch(/10 MB/);
    expect(lerArquivo(bytes("x"), "planilha.xls").erros[0]).toMatch(/Formato não suportado/);
  });
});

describe("lerArquivo (.csv)", () => {
  it("lê CSV do Excel brasileiro (; e vírgula decimal)", () => {
    const csv = "codigo_obra;tipo;data;valor;categoria\r\nAUR-001;custo;10/03/2026;1.234,56;Materiais\r\n";
    const r = lerArquivo(bytes(csv), "dados.csv", "lancamentos");
    const f = r.folhas[0]!;
    expect(f.dataset).toBe("lancamentos");
    expect(f.linhas[0]!.valores).toMatchObject({ codigo_obra: "AUR-001", valor: "1.234,56", categoria: "Materiais" });
    expect(f.linhas[0]!.numero).toBe(2);
  });

  it("lê CSV em Windows-1252 com acentos", () => {
    // "Categoria;Mão de obra" em cp1252
    const cabecalho = bytes("codigo_obra;tipo;data;valor;categoria\n");
    const linha = new Uint8Array([...bytes("AUR-001;custo;10/03/2026;10;M"), 0xe3, ...bytes("o de obra\n")]);
    const r = lerArquivo(new Uint8Array([...cabecalho, ...linha]), "x.csv", "lancamentos");
    expect(r.folhas[0]!.linhas[0]!.valores.categoria).toBe("Mão de obra");
  });

  it("exige o conjunto de dados para .csv", () => {
    expect(lerArquivo(bytes("a;b\n1;2"), "x.csv").erros[0]).toMatch(/informe qual conjunto/);
  });
});
