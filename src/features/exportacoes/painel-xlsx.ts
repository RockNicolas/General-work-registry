import ExcelJS from "exceljs";
import type { DashboardDados } from "@/features/dashboards/queries";
import { rotuloGrupo } from "@/features/dashboards/rotulos";
import { FAIXAS_VENCIMENTO } from "@/features/dashboards/faixas";
import { LANCAMENTO_CLASSE_LABEL, OBRA_STATUS_LABEL } from "@/lib/domain";
import { type MetaRelatorio, textoGeradoEm } from "./meta";
import { FMT, abaTabela, dataExcel, fracao, linhaDeTotais, reais } from "./xlsx-comum";

const DEFINICOES = [
  "Incorrido: custo já pago (realizado).",
  "Comprometido: custo pago + custo a pagar.",
  "Orçado: orçamento vigente da obra (versões antigas não contam).",
  "Desvio: comprometido − orçado; positivo = acima do orçamento.",
  "Margem realizada: receita realizada − custo realizado. Margem projetada: (receita realizada + a receber) − comprometido.",
  "Só lançamentos operacionais entram. Aportes, adiantamentos e devoluções a sócios ficam fora da margem (aba própria).",
  "Resultado do período (KPIs, evolução, categorias, etapas): por data de competência. Acumulados (obras, grupos, avanço): tudo até o mês final do período.",
  "Vencimentos: o que está a pagar/receber a partir da data de geração, independente do período.",
];

/** O relatório do painel em Excel: uma aba por seção, números como números (com fórmulas nos totais). */
export async function gerarPainelXlsx(d: DashboardDados, meta: MetaRelatorio): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RGO — Registro Geral de Obra";
  wb.created = meta.geradoEm;
  wb.title = meta.titulo;

  resumo(wb, d, meta);
  evolucao(wb, d);
  obras(wb, d);
  grupos(wb, d);
  ranking(wb, "Custo por categoria", "Categoria", d.categorias);
  ranking(wb, "Custo por etapa", "Etapa", d.etapas);
  avanco(wb, d);
  vencimentos(wb, d);
  foraDaMargem(wb, d);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function resumo(wb: ExcelJS.Workbook, d: DashboardDados, meta: MetaRelatorio) {
  const ws = wb.addWorksheet("Resumo");
  ws.columns = [{ width: 34 }, { width: 22 }, { width: 60 }];
  ws.addRow([meta.titulo]).font = { bold: true, size: 16 };
  ws.addRow([`Gerado em ${textoGeradoEm(meta)} por ${meta.usuario}`]).font = { color: { argb: "FF6B7280" } };
  ws.addRow([]);
  ws.addRow(["Filtros"]).font = { bold: true };
  for (const f of meta.filtros) ws.addRow([f.rotulo, f.valor]);
  ws.addRow([]);
  ws.addRow(["Indicadores do período"]).font = { bold: true };

  const k = d.kpis;
  const linhas: [string, number | null, string, string?][] = [
    ["Receita realizada", reais(k.receitaRealizada), FMT.dinheiro],
    ["Receita a receber", reais(k.receitaAReceber), FMT.dinheiro],
    ["Custo realizado", reais(k.custoRealizado), FMT.dinheiro],
    ["Custo a pagar", reais(k.custoAPagar), FMT.dinheiro],
    ["Margem realizada", reais(k.margemRealizada), FMT.dinheiro],
    ["Margem realizada (% da receita)", fracao(k.margemRealizadaBps), FMT.percentual],
    ["Margem projetada", reais(k.margemProjetada), FMT.dinheiro],
    ["Margem projetada (% da receita total)", fracao(k.margemProjetadaBps), FMT.percentual],
    ["Obras", k.obrasTotal, FMT.inteiro],
    ["Obras ativas", k.obrasAtivas, FMT.inteiro],
  ];
  for (const [rotulo, valor, formato] of linhas) {
    const linha = ws.addRow([rotulo, valor]);
    linha.getCell(2).numFmt = formato;
    linha.getCell(2).alignment = { horizontal: "right" };
    if (valor === null) linha.getCell(2).value = "—";
  }

  ws.addRow([]);
  ws.addRow(["Como os números são calculados"]).font = { bold: true };
  for (const t of DEFINICOES) {
    const linha = ws.addRow([t]);
    ws.mergeCells(linha.number, 1, linha.number, 3);
    linha.getCell(1).alignment = { wrapText: true, vertical: "top" };
    linha.height = t.length > 110 ? 32 : 18;
  }
}

function evolucao(wb: ExcelJS.Workbook, d: DashboardDados) {
  const ws = abaTabela(wb, "Evolução mensal", [
    { titulo: "Mês", chave: "mes", largura: 12, formato: FMT.mes, alinhar: "left" },
    { titulo: "Receita realizada", chave: "receita", largura: 20, formato: FMT.dinheiro },
    { titulo: "Custo realizado", chave: "custo", largura: 20, formato: FMT.dinheiro },
    { titulo: "Margem", chave: "margem", largura: 20, formato: FMT.dinheiro },
    { titulo: "Custo a pagar", chave: "aPagar", largura: 20, formato: FMT.dinheiro },
    { titulo: "Receita a receber", chave: "aReceber", largura: 20, formato: FMT.dinheiro },
  ]);
  for (const p of d.evolucao) {
    ws.addRow({ mes: dataExcel(`${p.mes}-01`), receita: reais(p.receita), custo: reais(p.custo), margem: reais(p.margem), aPagar: reais(p.aPagar), aReceber: reais(p.aReceber) });
  }
  if (d.evolucao.length > 0) {
    const soma = (f: (p: DashboardDados["evolucao"][number]) => number) => reais(d.evolucao.reduce((s, p) => s + f(p), 0));
    linhaDeTotais(ws, 2, d.evolucao.length + 1, [
      { chave: "receita", total: soma((p) => p.receita) },
      { chave: "custo", total: soma((p) => p.custo) },
      { chave: "margem", total: soma((p) => p.margem) },
      { chave: "aPagar", total: soma((p) => p.aPagar) },
      { chave: "aReceber", total: soma((p) => p.aReceber) },
    ], { chave: "mes", texto: "Total" });
  }
}

function obras(wb: ExcelJS.Workbook, d: DashboardDados) {
  const ws = abaTabela(wb, "Obras", [
    { titulo: "Código", chave: "codigo", largura: 14 },
    { titulo: "Obra", chave: "nome", largura: 38 },
    { titulo: "Empresa", chave: "empresa", largura: 28 },
    { titulo: "Situação", chave: "status", largura: 12 },
    { titulo: "Orçado", chave: "orcado", largura: 18, formato: FMT.dinheiro },
    { titulo: "Comprometido", chave: "comprometido", largura: 18, formato: FMT.dinheiro },
    { titulo: "% do orçado", chave: "pct", largura: 12, formato: FMT.percentual },
    { titulo: "Incorrido (pago)", chave: "incorrido", largura: 18, formato: FMT.dinheiro },
    { titulo: "Desvio do orçado", chave: "desvio", largura: 18, formato: FMT.dinheiro },
    { titulo: "Desvio %", chave: "desvioPct", largura: 12, formato: FMT.percentual },
    { titulo: "Receita realizada", chave: "receita", largura: 18, formato: FMT.dinheiro },
    { titulo: "Receita total", chave: "receitaTotal", largura: 18, formato: FMT.dinheiro },
    { titulo: "Margem realizada", chave: "margem", largura: 18, formato: FMT.dinheiro },
    { titulo: "Margem realizada %", chave: "margemPct", largura: 14, formato: FMT.percentual },
    { titulo: "Margem projetada", chave: "projetada", largura: 18, formato: FMT.dinheiro },
    { titulo: "Margem projetada %", chave: "projetadaPct", largura: 14, formato: FMT.percentual },
  ]);
  for (const o of d.obras) {
    ws.addRow({
      codigo: o.codigo,
      nome: o.nome,
      empresa: o.empresaNome,
      status: OBRA_STATUS_LABEL[o.status],
      orcado: reais(o.orcado),
      comprometido: reais(o.comprometido),
      pct: fracao(o.pctComprometidoBps),
      incorrido: reais(o.incorrido),
      desvio: reais(o.desvio),
      desvioPct: fracao(o.desvioBps),
      receita: reais(o.receitaRealizada),
      receitaTotal: reais(o.receitaTotal),
      margem: reais(o.margemRealizada),
      margemPct: fracao(o.margemRealizadaBps),
      projetada: reais(o.margemProjetada),
      projetadaPct: fracao(o.margemProjetadaBps),
    });
  }
  if (d.obras.length > 0) {
    const soma = (f: (o: DashboardDados["obras"][number]) => number) => reais(d.obras.reduce((s, o) => s + f(o), 0));
    linhaDeTotais(ws, 2, d.obras.length + 1, [
      { chave: "orcado", total: soma((o) => o.orcado) },
      { chave: "comprometido", total: soma((o) => o.comprometido) },
      { chave: "incorrido", total: soma((o) => o.incorrido) },
      { chave: "desvio", total: soma((o) => o.desvio) },
      { chave: "receita", total: soma((o) => o.receitaRealizada) },
      { chave: "receitaTotal", total: soma((o) => o.receitaTotal) },
      { chave: "margem", total: soma((o) => o.margemRealizada) },
      { chave: "projetada", total: soma((o) => o.margemProjetada) },
    ], { chave: "nome", texto: "Total" });
  }
}

function grupos(wb: ExcelJS.Workbook, d: DashboardDados) {
  const ws = abaTabela(wb, "Grupos de custo", [
    { titulo: "Grupo", chave: "grupo", largura: 30 },
    { titulo: "Orçado", chave: "orcado", largura: 18, formato: FMT.dinheiro },
    { titulo: "Comprometido", chave: "comprometido", largura: 18, formato: FMT.dinheiro },
    { titulo: "% comprometido do orçado", chave: "pct", largura: 18, formato: FMT.percentual },
    { titulo: "Incorrido (pago)", chave: "incorrido", largura: 18, formato: FMT.dinheiro },
    { titulo: "% do orçamento total", chave: "peso", largura: 16, formato: FMT.percentual },
  ]);
  for (const g of d.grupos) {
    ws.addRow({ grupo: rotuloGrupo(g.grupo), orcado: reais(g.orcado), comprometido: reais(g.comprometido), pct: fracao(g.pctComprometidoBps), incorrido: reais(g.incorrido), peso: fracao(g.pctDoOrcadoBps) });
  }
}

function ranking(wb: ExcelJS.Workbook, nome: string, rotulo: string, fatias: DashboardDados["categorias"]) {
  const ws = abaTabela(wb, nome, [
    { titulo: rotulo, chave: "rotulo", largura: 40 },
    { titulo: "Custo comprometido no período", chave: "valor", largura: 28, formato: FMT.dinheiro },
  ]);
  for (const f of fatias) ws.addRow({ rotulo: f.rotulo, valor: reais(f.valor) });
}

function avanco(wb: ExcelJS.Workbook, d: DashboardDados) {
  const ws = abaTabela(wb, "Avanço físico", [
    { titulo: "Obra", chave: "obra", largura: 40 },
    { titulo: "Mês", chave: "mes", largura: 12, formato: FMT.mes, alinhar: "left" },
    { titulo: "Planejado no mês", chave: "pm", largura: 16, formato: FMT.percentual },
    { titulo: "Planejado acumulado", chave: "pa", largura: 18, formato: FMT.percentual },
    { titulo: "Realizado no mês", chave: "rm", largura: 16, formato: FMT.percentual },
    { titulo: "Realizado acumulado", chave: "ra", largura: 18, formato: FMT.percentual },
    { titulo: "Desvio acumulado", chave: "desvio", largura: 16, formato: FMT.percentual },
  ]);
  for (const o of d.avanco) {
    for (const m of o.serie) {
      ws.addRow({ obra: `${o.codigo} — ${o.nome}`, mes: dataExcel(m.competencia), pm: fracao(m.planejadoMesBps), pa: fracao(m.planejadoAcumBps), rm: fracao(m.realizadoMesBps), ra: fracao(m.realizadoAcumBps), desvio: fracao(m.desvioAcumBps) });
    }
  }
}

function vencimentos(wb: ExcelJS.Workbook, d: DashboardDados) {
  const ws = abaTabela(wb, "Vencimentos", [
    { titulo: "Tipo", chave: "tipo", largura: 14 },
    { titulo: "Faixa (dias a partir da geração)", chave: "faixa", largura: 30 },
    { titulo: "Títulos efetivos", chave: "efetivo", largura: 20, formato: FMT.dinheiro },
    { titulo: "Títulos de previsão", chave: "previsao", largura: 20, formato: FMT.dinheiro },
    { titulo: "Total", chave: "total", largura: 20, formato: FMT.dinheiro },
  ]);
  for (const [tipo, v] of [["A pagar", d.aPagar], ["A receber", d.aReceber]] as const) {
    for (const f of v.faixas) {
      ws.addRow({ tipo, faixa: FAIXAS_VENCIMENTO.find((x) => x.id === f.faixa)?.rotulo ?? f.rotulo, efetivo: reais(f.efetivo), previsao: reais(f.previsao), total: reais(f.efetivo + f.previsao) });
    }
    if (v.semVencimento !== 0) ws.addRow({ tipo, faixa: "Sem data de vencimento", efetivo: null, previsao: null, total: reais(v.semVencimento) });
  }
}

function foraDaMargem(wb: ExcelJS.Workbook, d: DashboardDados) {
  const ws = abaTabela(wb, "Fora da margem", [
    { titulo: "Classe", chave: "classe", largura: 26 },
    { titulo: "Sentido", chave: "tipo", largura: 14 },
    { titulo: "Valor realizado no período", chave: "valor", largura: 26, formato: FMT.dinheiro },
  ]);
  for (const f of d.foraDaMargem) ws.addRow({ classe: LANCAMENTO_CLASSE_LABEL[f.classe], tipo: f.tipo === "receita" ? "Entrada" : "Saída", valor: reais(f.valor) });
  if (d.foraDaMargem.length === 0) ws.addRow({ classe: "Nenhum movimento no período" });
}

