import ExcelJS from "exceljs";
import { DATASETS, type ColunaModelo, type DatasetKey, MODELO } from "./modelo";

const COR_CABECALHO = "FF1F2937";
const LINHAS_VALIDACAO = 5000;

/** Número de colunas → letra (1 → A, 27 → AA). */
function letra(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

const FORMATO: Partial<Record<ColunaModelo["tipo"], string>> = {
  data: "dd/mm/yyyy",
  mes: "mm/yyyy",
  dinheiro: "#,##0.00",
  percentual: "0.00",
  inteiro: "0",
};

function adicionarAba(wb: ExcelJS.Workbook, dataset: DatasetKey) {
  const def = MODELO[dataset];
  const ws = wb.addWorksheet(def.aba, { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = def.colunas.map((c) => ({
    header: c.chave,
    key: c.chave,
    width: Math.max(14, c.chave.length + 4, c.chave === "descricao" ? 36 : 0),
    style: { numFmt: FORMATO[c.tipo] ?? "@" },
  }));

  const cabecalho = ws.getRow(1);
  cabecalho.height = 22;
  cabecalho.eachCell((cell, col) => {
    const c = def.colunas[col - 1]!;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.obrigatoria ? COR_CABECALHO : "FF6B7280" } };
    cell.alignment = { vertical: "middle" };
    cell.note = `${c.obrigatoria ? "OBRIGATÓRIA" : "Opcional"} — ${c.descricao}\nExemplo: ${c.exemplo}`;
  });

  // Listas suspensas nas colunas de valores fixos.
  def.colunas.forEach((c, i) => {
    if (c.tipo !== "lista" || !c.opcoes) return;
    const col = letra(i + 1);
    for (let r = 2; r <= LINHAS_VALIDACAO; r++) {
      ws.getCell(`${col}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${c.opcoes.join(",")}"`],
        showErrorMessage: true,
        errorTitle: "Valor inválido",
        error: `Use: ${c.opcoes.join(", ")}`,
      };
    }
  });
}

function adicionarInstrucoes(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Instruções", { properties: { tabColor: { argb: "FFF59E0B" } } });
  ws.columns = [{ width: 24 }, { width: 14 }, { width: 14 }, { width: 80 }, { width: 28 }];

  const titulo = (texto: string, tamanho = 14) => {
    const r = ws.addRow([texto]);
    r.font = { bold: true, size: tamanho };
    return r;
  };
  const texto = (t: string) => ws.addRow([t]);

  titulo("Modelo de importação — RGO (Registro Geral de Obra)", 16);
  ws.addRow([]);
  texto("1. Preencha uma ou mais abas: Lancamentos, Orcamento e AvancoFisico. Deixe vazias as que não for usar.");
  texto("2. Mantenha a primeira linha (cabeçalho). Colunas em azul-escuro são obrigatórias; as cinza, opcionais.");
  texto("3. Datas no formato dd/mm/aaaa. Valores em reais (ex.: 1234,56). Percentuais de 0 a 100 (ex.: 4,5 para 4,5%).");
  texto("4. O código da obra, o nome da categoria e o código da etapa devem existir no sistema (cadastre antes).");
  texto("5. Envie o arquivo na tela Importações: o sistema mostra uma prévia e os erros por linha ANTES de gravar.");
  texto("6. Reenviar o mesmo arquivo não duplica. Para ATUALIZAR uma linha já importada, mantenha o mesmo id_externo.");
  texto("7. Aporte, adiantamento e devolução a sócios (coluna classe) ficam fora do cálculo de margem.");
  ws.addRow([]);

  for (const d of DATASETS) {
    const def = MODELO[d];
    titulo(`${def.titulo} — aba "${def.aba}"`);
    texto(def.descricao);
    const cab = ws.addRow(["Coluna", "Obrigatória", "Tipo", "Descrição", "Exemplo"]);
    cab.font = { bold: true };
    cab.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    });
    for (const c of def.colunas) {
      const linha = ws.addRow([c.chave, c.obrigatoria ? "sim" : "não", c.tipo, c.descricao, c.exemplo]);
      linha.getCell(4).alignment = { wrapText: true, vertical: "top" };
    }
    ws.addRow([]);
  }
}

/** Arquivo-modelo .xlsx: instruções + uma aba vazia por conjunto de dados. */
export async function gerarModeloXlsx(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RGO";
  adicionarInstrucoes(wb);
  for (const d of DATASETS) adicionarAba(wb, d);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Modelo .csv de um conjunto de dados: só o cabeçalho, ";" e BOM (abre certo no Excel em português). */
export function gerarModeloCsv(dataset: DatasetKey): Uint8Array {
  const cabecalho = MODELO[dataset].colunas.map((c) => c.chave).join(";");
  return new TextEncoder().encode(`﻿${cabecalho}\r\n`);
}
