import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { dashboardExemplo, metaExemplo, obraExemplo } from "@/test/dashboard-exemplo";
import { gerarPainelXlsx } from "./painel-xlsx";

async function abrir(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb;
}

/** Valor "puro" da célula (resolve fórmula para o resultado). */
const v = (c: ExcelJS.Cell) => (c.value && typeof c.value === "object" && "result" in c.value ? c.value.result : c.value);

describe("gerarPainelXlsx", () => {
  it("é um .xlsx de verdade, com uma aba por seção, na ordem", async () => {
    const buffer = await gerarPainelXlsx(dashboardExemplo(), metaExemplo);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    const wb = await abrir(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Resumo",
      "Evolução mensal",
      "Obras",
      "Grupos de custo",
      "Custo por categoria",
      "Custo por etapa",
      "Avanço físico",
      "Vencimentos",
      "Fora da margem",
    ]);
    expect(wb.title).toBe("Painel de indicadores");
  });

  it("resumo: filtros com nomes, quem gerou e KPIs como números (reais e fração)", async () => {
    const wb = await abrir(await gerarPainelXlsx(dashboardExemplo(), metaExemplo));
    const ws = wb.getWorksheet("Resumo")!;
    const linhas = new Map<string, ExcelJS.Cell>();
    ws.eachRow((r) => {
      const rotulo = r.getCell(1).value;
      if (typeof rotulo === "string") linhas.set(rotulo, r.getCell(2));
    });
    expect(ws.getCell("A1").value).toBe("Painel de indicadores");
    expect(String(ws.getCell("A2").value)).toContain("Ana Admin");
    expect(linhas.get("Período")?.value).toBe("jan/2026 a mar/2026");
    expect(linhas.get("Obra")?.value).toBe("Todas as obras");

    expect(linhas.get("Receita realizada")?.value).toBe(8000); // 800.000 centavos = R$ 8.000,00
    expect(linhas.get("Receita realizada")?.numFmt).toContain("R$");
    expect(linhas.get("Custo a pagar")?.value).toBe(1700);
    expect(linhas.get("Margem realizada")?.value).toBe(5500);
    expect(linhas.get("Margem realizada (% da receita)")?.value).toBeCloseTo(0.6875, 6);
    expect(linhas.get("Margem realizada (% da receita)")?.numFmt).toBe("0.00%");
    expect(linhas.get("Obras ativas")?.value).toBe(3);
  });

  it("obras: valores numéricos, percentuais como fração, totais com fórmula SUM", async () => {
    const d = dashboardExemplo(3);
    const wb = await abrir(await gerarPainelXlsx(d, metaExemplo));
    const ws = wb.getWorksheet("Obras")!;
    const cab = ws.getRow(1).values as unknown[];
    expect(cab.slice(1, 6)).toEqual(["Código", "Obra", "Empresa", "Situação", "Orçado"]);

    const l2 = ws.getRow(2);
    expect(l2.getCell(1).value).toBe("OB-001");
    expect(l2.getCell(4).value).toBe("Ativa");
    expect(l2.getCell(5).value).toBe(10_000); // 1.000.000 centavos
    expect(l2.getCell(6).value).toBe(4_000);
    expect(l2.getCell(7).value).toBeCloseTo(0.4, 6); // 4000 bps
    expect(l2.getCell(9).value).toBe(-6_000); // desvio negativo = abaixo do orçado

    const total = ws.getRow(5); // cabeçalho + 3 obras + total
    expect(total.getCell(2).value).toBe("Total");
    const orcado = total.getCell(5).value as { formula: string; result: number };
    expect(orcado.formula).toBe("SUM(E2:E4)");
    expect(orcado.result).toBe(10_000 + 20_000 + 30_000);
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });

  it("evolução mensal: mês como data, soma dos meses na linha de total", async () => {
    const wb = await abrir(await gerarPainelXlsx(dashboardExemplo(1, 3), metaExemplo));
    const ws = wb.getWorksheet("Evolução mensal")!;
    const mes = ws.getRow(2).getCell(1).value;
    expect(mes).toBeInstanceOf(Date);
    expect((mes as Date).toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(ws.getRow(2).getCell(1).numFmt).toBe("mm/yyyy");
    expect(ws.getRow(2).getCell(2).value).toBe(1_000); // receita de jan: 100.000 centavos
    expect(v(ws.getRow(5).getCell(2))).toBe(1_000 + 2_000 + 3_000);
  });

  it("vencimentos: faixas por tipo, previsão separada e o 'sem vencimento' à parte", async () => {
    const wb = await abrir(await gerarPainelXlsx(dashboardExemplo(), metaExemplo));
    const ws = wb.getWorksheet("Vencimentos")!;
    const linhas: Record<string, unknown>[] = [];
    ws.eachRow((r, n) => {
      if (n > 1) linhas.push({ tipo: r.getCell(1).value, faixa: r.getCell(2).value, efetivo: r.getCell(3).value, previsao: r.getCell(4).value, total: r.getCell(5).value });
    });
    expect(linhas.filter((l) => l.tipo === "A pagar")).toHaveLength(7 + 1); // 7 faixas + sem vencimento
    expect(linhas.find((l) => l.tipo === "A pagar" && l.faixa === "Até 30 dias")).toMatchObject({ efetivo: 1000, previsao: 0, total: 1000 });
    expect(linhas.find((l) => l.tipo === "A pagar" && l.faixa === "46 a 60 dias")).toMatchObject({ efetivo: 0, previsao: 700, total: 700 });
    expect(linhas.find((l) => l.faixa === "Sem data de vencimento")).toMatchObject({ tipo: "A pagar", total: 50 });
    expect(linhas.find((l) => l.tipo === "A receber" && l.faixa === "31 a 45 dias")).toMatchObject({ total: 3000 });
  });

  it("avanço físico e fora da margem", async () => {
    const wb = await abrir(await gerarPainelXlsx(dashboardExemplo(), metaExemplo));
    const av = wb.getWorksheet("Avanço físico")!;
    expect(av.getRow(3).getCell(1).value).toBe("OB-001 — Obra de exemplo 1");
    expect(av.getRow(3).getCell(4).value).toBeCloseTo(0.25, 6); // planejado acumulado de fev
    expect(av.getRow(3).getCell(7).value).toBeCloseTo(-0.05, 6); // desvio
    const fora = wb.getWorksheet("Fora da margem")!;
    expect(fora.getRow(2).values).toEqual([undefined, "Aporte", "Entrada", 5000]);
  });

  it("texto que parece fórmula fica como texto (não é executado pelo Excel)", async () => {
    const d = dashboardExemplo(1);
    d.obras = [obraExemplo(0, { nome: "=HYPERLINK(\"http://evil\",\"x\")", codigo: "+1+1" })];
    const wb = await abrir(await gerarPainelXlsx(d, metaExemplo));
    const c = wb.getWorksheet("Obras")!.getRow(2).getCell(2);
    expect(typeof c.value).toBe("string");
    expect(c.formula).toBeUndefined();
  });

  it("sem dados nenhum: gera um arquivo válido, sem linhas de total", async () => {
    const d = dashboardExemplo(0, 1);
    d.evolucao = [];
    d.grupos = [];
    d.categorias = [];
    d.etapas = [];
    d.avanco = [];
    d.foraDaMargem = [];
    const wb = await abrir(await gerarPainelXlsx(d, metaExemplo));
    expect(wb.getWorksheet("Obras")!.rowCount).toBe(1); // só o cabeçalho
    expect(wb.getWorksheet("Evolução mensal")!.rowCount).toBe(1);
    expect(wb.getWorksheet("Fora da margem")!.getRow(2).getCell(1).value).toBe("Nenhum movimento no período");
  });

  it("valores negativos e grandes mantêm precisão de centavos (R$ 900 milhões)", async () => {
    const d = dashboardExemplo(1);
    d.obras = [obraExemplo(0, { orcado: 90_000_000_012, margemRealizada: -1_234_567_89 })];
    const wb = await abrir(await gerarPainelXlsx(d, metaExemplo));
    const l = wb.getWorksheet("Obras")!.getRow(2);
    expect(l.getCell(5).value).toBe(900_000_000.12);
    expect(l.getCell(13).value).toBeCloseTo(-1_234_567.89, 2);
  });
});
