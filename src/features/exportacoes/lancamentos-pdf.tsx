import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { LancamentoRow } from "@/features/lancamentos/service";
import { LANCAMENTO_CLASSE_LABEL, LANCAMENTO_SITUACAO_LABEL, LANCAMENTO_TIPO_LABEL } from "@/lib/domain";
import { formatDateBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import type { TotaisLancamentos } from "./lancamentos-xlsx";
import { type MetaRelatorio, textoGeradoEm } from "./meta";
import { Tabela, s, texto } from "./pdf-componentes";

/** Primeira página também leva os totais; as seguintes só a tabela. */
const LINHAS_PRIMEIRA = 16;
const LINHAS_SEGUINTE = 24;

const brl = (c: number) => texto(formatBRL(c));
const data = (iso: string | null) => (iso ? (formatDateBR(iso) ?? "-") : "-");

const COLUNAS = [
  { titulo: "Competência", largura: 1.7 },
  { titulo: "Tipo", largura: 1.2 },
  { titulo: "Situação", largura: 1.5 },
  { titulo: "Classe", largura: 2.2 },
  { titulo: "Valor", largura: 2.2, direita: true },
  { titulo: "Vencimento", largura: 1.7 },
  { titulo: "Categoria", largura: 3.2 },
  { titulo: "Fornecedor / cliente", largura: 3.2 },
  { titulo: "Descrição", largura: 4.2 },
];

function fatiar(rows: LancamentoRow[]): LancamentoRow[][] {
  if (rows.length === 0) return [[]];
  const paginas: LancamentoRow[][] = [rows.slice(0, LINHAS_PRIMEIRA)];
  for (let i = LINHAS_PRIMEIRA; i < rows.length; i += LINHAS_SEGUINTE) paginas.push(rows.slice(i, i + LINHAS_SEGUINTE));
  return paginas;
}

function linha(r: LancamentoRow): string[] {
  return [
    data(r.dataCompetencia),
    LANCAMENTO_TIPO_LABEL[r.tipo],
    LANCAMENTO_SITUACAO_LABEL[r.situacao],
    LANCAMENTO_CLASSE_LABEL[r.classe],
    brl(r.valorCentavos),
    data(r.dataVencimento),
    r.categoriaNome || "-",
    r.contraparte || "-",
    r.descricao || "-",
  ];
}

function Rodape({ meta }: { meta: MetaRelatorio }) {
  return (
    <View style={s.rodape} fixed>
      <Text>
        RGO - Registro Geral de Obra · {meta.titulo} · gerado em {textoGeradoEm(meta)} por {meta.usuario}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

/**
 * Lançamentos de UMA obra em PDF (A4 paisagem), com os mesmos filtros da lista.
 * É o relatório para ler e imprimir: etapa, documento, origem e data de pagamento ficam na planilha.
 */
export async function gerarLancamentosPdf(rows: LancamentoRow[], totais: TotaisLancamentos, meta: MetaRelatorio): Promise<Buffer> {
  const paginas = fatiar(rows);

  const documento = (
    <Document title={meta.titulo} author={meta.usuario} creator="RGO - Registro Geral de Obra" producer="RGO" language="pt-BR">
      {paginas.map((lote, i) => (
        <Page key={i} size="A4" orientation="landscape" style={s.pagina}>
          <Text style={s.titulo}>{paginas.length > 1 ? `${meta.titulo} (${i + 1}/${paginas.length})` : meta.titulo}</Text>
          {i === 0 ? (
            <>
              <Text style={s.subtitulo}>{meta.filtros.map((f) => `${f.rotulo}: ${f.valor}`).join("  ·  ")}</Text>
              <View style={s.kpis}>
                <View style={s.kpi}>
                  <Text style={s.kpiRotulo}>Lançamentos</Text>
                  <Text style={s.kpiValor}>{totais.total.toLocaleString("pt-BR")}</Text>
                  <Text style={s.kpiDetalhe}>com os filtros aplicados</Text>
                </View>
                <View style={s.kpi}>
                  <Text style={s.kpiRotulo}>Custos</Text>
                  <Text style={s.kpiValor}>{brl(totais.somaCustoCentavos)}</Text>
                  <Text style={s.kpiDetalhe}>todas as classes</Text>
                </View>
                <View style={[s.kpi, { marginRight: 0 }]}>
                  <Text style={s.kpiRotulo}>Receitas</Text>
                  <Text style={s.kpiValor}>{brl(totais.somaReceitaCentavos)}</Text>
                  <Text style={s.kpiDetalhe}>todas as classes</Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={s.subtitulo}>Continuação. Totais na primeira página.</Text>
          )}
          <Text style={s.secao}>Lançamentos</Text>
          <Text style={s.nota}>
            Valor negativo é estorno. A planilha Excel traz também etapa, documento, origem, título de previsão e data de pagamento ou recebimento.
          </Text>
          <Tabela colunas={COLUNAS} linhas={lote.map(linha)} vazio="Nenhum lançamento nos filtros escolhidos." />
          <Rodape meta={meta} />
        </Page>
      ))}
    </Document>
  );

  return renderToBuffer(documento);
}
