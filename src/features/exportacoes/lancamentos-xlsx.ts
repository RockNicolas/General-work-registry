import ExcelJS from "exceljs";
import type { LancamentoRow } from "@/features/lancamentos/service";
import { LANCAMENTO_CLASSE_LABEL, LANCAMENTO_SITUACAO_LABEL, LANCAMENTO_TIPO_LABEL, ORIGEM_LABEL } from "@/lib/domain";
import { type MetaRelatorio, textoGeradoEm } from "./meta";
import { FMT, abaTabela, dataExcel, reais } from "./xlsx-comum";

export type TotaisLancamentos = { total: number; somaCustoCentavos: number; somaReceitaCentavos: number };

/**
 * Lançamentos de UMA obra, com os filtros aplicados na tela, numa planilha pronta para filtrar e somar.
 * Valor negativo é estorno. As datas saem como datas do Excel; o valor, como número em reais.
 */
export async function gerarLancamentosXlsx(rows: LancamentoRow[], totais: TotaisLancamentos, meta: MetaRelatorio): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RGO — Registro Geral de Obra";
  wb.created = meta.geradoEm;
  wb.title = meta.titulo;

  const ws = abaTabela(wb, "Lançamentos", [
    { titulo: "Competência", chave: "competencia", largura: 13, formato: FMT.data, alinhar: "left" },
    { titulo: "Tipo", chave: "tipo", largura: 10 },
    { titulo: "Situação", chave: "situacao", largura: 12 },
    { titulo: "Classe", chave: "classe", largura: 18 },
    { titulo: "Título de previsão", chave: "previsao", largura: 10, alinhar: "center" },
    { titulo: "Valor", chave: "valor", largura: 18, formato: FMT.dinheiro },
    { titulo: "Vencimento", chave: "vencimento", largura: 13, formato: FMT.data, alinhar: "left" },
    { titulo: "Pagamento / recebimento", chave: "liquidacao", largura: 15, formato: FMT.data, alinhar: "left" },
    { titulo: "Categoria", chave: "categoria", largura: 30 },
    { titulo: "Etapa", chave: "etapa", largura: 28 },
    { titulo: "Fornecedor / cliente", chave: "contraparte", largura: 32 },
    { titulo: "Documento", chave: "documento", largura: 18 },
    { titulo: "Descrição", chave: "descricao", largura: 44 },
    { titulo: "Origem", chave: "origem", largura: 10 },
  ]);

  for (const r of rows) {
    ws.addRow({
      competencia: dataExcel(r.dataCompetencia),
      tipo: LANCAMENTO_TIPO_LABEL[r.tipo],
      situacao: LANCAMENTO_SITUACAO_LABEL[r.situacao],
      classe: LANCAMENTO_CLASSE_LABEL[r.classe],
      previsao: r.isPrevisao ? "Sim" : "Não",
      valor: reais(r.valorCentavos),
      vencimento: dataExcel(r.dataVencimento),
      liquidacao: dataExcel(r.dataLiquidacao),
      categoria: r.categoriaNome,
      etapa: r.etapaLabel,
      contraparte: r.contraparte,
      documento: r.documento,
      descricao: r.descricao,
      origem: ORIGEM_LABEL[r.origem],
    });
  }

  const info = wb.addWorksheet("Filtros e totais");
  info.columns = [{ width: 30 }, { width: 50 }];
  info.addRow([meta.titulo]).font = { bold: true, size: 14 };
  info.addRow([`Gerado em ${textoGeradoEm(meta)} por ${meta.usuario}`]).font = { color: { argb: "FF6B7280" } };
  info.addRow([]);
  info.addRow(["Filtros"]).font = { bold: true };
  for (const f of meta.filtros) info.addRow([f.rotulo, f.valor]);
  info.addRow([]);
  info.addRow(["Totais (com os filtros)"]).font = { bold: true };
  for (const [rotulo, valor] of [
    ["Lançamentos", totais.total],
    ["Custos", reais(totais.somaCustoCentavos)],
    ["Receitas", reais(totais.somaReceitaCentavos)],
  ] as const) {
    const linha = info.addRow([rotulo, valor]);
    linha.getCell(2).numFmt = rotulo === "Lançamentos" ? FMT.inteiro : FMT.dinheiro;
    linha.getCell(2).alignment = { horizontal: "right" };
  }
  info.addRow([]);
  info.addRow(["Valores negativos são estornos. Custos e receitas incluem todas as classes (operacional, aporte, adiantamento, devolução)."]).font = { italic: true, color: { argb: "FF6B7280" } };


  return Buffer.from(await wb.xlsx.writeBuffer());
}
