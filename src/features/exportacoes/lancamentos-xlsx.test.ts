import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { LancamentoRow } from "@/features/lancamentos/service";
import { metaExemplo } from "@/test/dashboard-exemplo";
import { gerarLancamentosXlsx } from "./lancamentos-xlsx";

const linha = (extra: Partial<LancamentoRow> = {}): LancamentoRow => ({
  id: "id-1",
  tipo: "custo",
  situacao: "realizado",
  classe: "operacional",
  isPrevisao: false,
  valorCentavos: 123_456,
  dataCompetencia: "2026-03-10",
  dataVencimento: "2026-03-20",
  dataLiquidacao: "2026-03-18",
  categoriaId: "c1",
  categoriaNome: "Materiais de construção",
  etapaId: "e1",
  etapaLabel: "01 — Fundação",
  contraparte: "Fornecedor X",
  documento: "NF 123",
  descricao: "Cimento",
  origem: "erp",
  ...extra,
});

const abrir = async (b: Buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(b as unknown as ExcelJS.Buffer);
  return wb;
};

describe("gerarLancamentosXlsx", () => {
  const meta = { ...metaExemplo, titulo: "Lançamentos — OB-001" };

  it("uma linha por lançamento, com datas do Excel e valor numérico em reais", async () => {
    const rows = [linha(), linha({ id: "2", tipo: "receita", valorCentavos: -5_000, dataVencimento: null, dataLiquidacao: null, etapaLabel: null, contraparte: null, isPrevisao: true, situacao: "a_realizar", classe: "aporte", origem: "planilha" })];
    const wb = await abrir(await gerarLancamentosXlsx(rows, { total: 2, somaCustoCentavos: 123_456, somaReceitaCentavos: -5_000 }, meta));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Lançamentos", "Filtros e totais"]);

    const ws = wb.getWorksheet("Lançamentos")!;
    expect(ws.rowCount).toBe(3); // cabeçalho + 2
    const a = ws.getRow(2);
    expect((a.getCell(1).value as Date).toISOString().slice(0, 10)).toBe("2026-03-10");
    expect(a.getCell(1).numFmt).toBe("dd/mm/yyyy");
    expect(a.getCell(2).value).toBe("Custo");
    expect(a.getCell(3).value).toBe("Realizado");
    expect(a.getCell(5).value).toBe("Não");
    expect(a.getCell(6).value).toBe(1234.56);
    expect(a.getCell(9).value).toBe("Materiais de construção");
    expect(a.getCell(10).value).toBe("01 — Fundação");
    expect(a.getCell(14).value).toBe("ERP");

    const b = ws.getRow(3);
    expect(b.getCell(6).value).toBe(-50); // estorno mantém o sinal
    expect(b.getCell(5).value).toBe("Sim");
    expect(b.getCell(4).value).toBe("Aporte");
    expect(b.getCell(7).value).toBeNull(); // sem vencimento: célula vazia, não "null"
    expect(b.getCell(10).value).toBeNull();
    expect(b.getCell(14).value).toBe("Planilha");
  });

  it("aba de filtros e totais: quem gerou, filtros e totais (com os filtros)", async () => {
    const wb = await abrir(await gerarLancamentosXlsx([linha()], { total: 1, somaCustoCentavos: 123_456, somaReceitaCentavos: 0 }, meta));
    const ws = wb.getWorksheet("Filtros e totais")!;
    const mapa = new Map<string, unknown>();
    ws.eachRow((r) => mapa.set(String(r.getCell(1).value), r.getCell(2).value));
    expect(String(ws.getCell("A2").value)).toContain("Ana Admin");
    expect(mapa.get("Lançamentos")).toBe(1);
    expect(mapa.get("Custos")).toBe(1234.56);
    expect(mapa.get("Receitas")).toBe(0);
    expect(mapa.get("Período")).toBe("jan/2026 a mar/2026");
  });

  it("sem lançamentos: planilha válida só com o cabeçalho", async () => {
    const wb = await abrir(await gerarLancamentosXlsx([], { total: 0, somaCustoCentavos: 0, somaReceitaCentavos: 0 }, meta));
    expect(wb.getWorksheet("Lançamentos")!.rowCount).toBe(1);
  });

  it("descrição que parece fórmula fica como texto", async () => {
    const wb = await abrir(await gerarLancamentosXlsx([linha({ descricao: "=cmd|' /C calc'!A0", contraparte: "@SUM(1+1)" })], { total: 1, somaCustoCentavos: 0, somaReceitaCentavos: 0 }, meta));
    const r = wb.getWorksheet("Lançamentos")!.getRow(2);
    expect(typeof r.getCell(13).value).toBe("string");
    expect(r.getCell(13).formula).toBeUndefined();
    expect(typeof r.getCell(11).value).toBe("string");
  });
});
