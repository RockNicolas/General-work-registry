import type ExcelJS from "exceljs";

/** Formatos de célula. Dinheiro vai como número em REAIS (centavos ÷ 100) e percentual como fração. */
export const FMT = {
  dinheiro: '"R$" #,##0.00;[Red]-"R$" #,##0.00',
  percentual: "0.00%",
  data: "dd/mm/yyyy",
  mes: "mm/yyyy",
  inteiro: "#,##0",
} as const;

const COR_CABECALHO = "FF1F2937";

export const reais = (centavos: number): number => centavos / 100;
export const fracao = (bps: number | null): number | null => (bps === null ? null : bps / 10_000);

/** "2026-03-15" → Date UTC à meia-noite (o Excel guarda data como número, sem fuso). */
export function dataExcel(iso: string | null): Date | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

export type ColunaPlanilha = { titulo: string; chave: string; largura: number; formato?: string; alinhar?: "left" | "right" | "center" };

/**
 * Cria uma aba "tabela": cabeçalho escuro, linha congelada, filtro automático e larguras.
 * Retorna a aba para o chamador acrescentar linhas e totais.
 */
export function abaTabela(wb: ExcelJS.Workbook, nome: string, colunas: ColunaPlanilha[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(nome, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = colunas.map((c) => ({
    header: c.titulo,
    key: c.chave,
    width: c.largura,
    style: { ...(c.formato ? { numFmt: c.formato } : {}), ...(c.alinhar ? { alignment: { horizontal: c.alinhar } } : {}) },
  }));
  const cab = ws.getRow(1);
  cab.height = 22;
  cab.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  return ws;
}

/** Linha de totais com fórmulas SUM (e o resultado já calculado, para visualizadores que não recalculam). */
export function linhaDeTotais(ws: ExcelJS.Worksheet, primeiraLinha: number, ultimaLinha: number, somas: { chave: string; total: number }[], rotulo: { chave: string; texto: string }) {
  const linha = ws.addRow({ [rotulo.chave]: rotulo.texto });
  for (const s of somas) {
    const col = ws.getColumn(s.chave);
    const letra = col.letter;
    linha.getCell(s.chave).value = { formula: `SUM(${letra}${primeiraLinha}:${letra}${ultimaLinha})`, result: s.total };
  }
  linha.font = { bold: true };
  linha.eachCell((c) => {
    c.border = { top: { style: "thin" } };
  });
  return linha;
}
