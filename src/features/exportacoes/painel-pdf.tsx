import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { FAIXAS_VENCIMENTO } from "@/features/dashboards/faixas";
import { rotuloMes } from "@/features/dashboards/periodo";
import type { DashboardDados } from "@/features/dashboards/queries";
import { rotuloGrupo } from "@/features/dashboards/rotulos";
import { LANCAMENTO_CLASSE_LABEL, OBRA_STATUS_LABEL } from "@/lib/domain";
import { formatBRL } from "@/lib/money";
import { formatBps } from "@/lib/percent";
import { type MetaRelatorio, textoGeradoEm } from "./meta";
import { COR, GraficoBarras, Tabela, s, texto } from "./pdf-componentes";

const LINHAS_POR_PAGINA = 16;

const brl = (c: number) => texto(formatBRL(c));
const pct = (bps: number | null) => (bps === null ? "-" : formatBps(bps));
const sinal = (c: number) => (c > 0 ? "+" : "");

const DEFINICOES = [
  "Incorrido: custo já pago (realizado). Comprometido: custo pago + custo a pagar. Orçado: orçamento vigente da obra.",
  "Desvio: comprometido - orçado; positivo = acima do orçamento.",
  "Margem realizada: receita realizada - custo realizado. Margem projetada: (receita realizada + a receber) - comprometido.",
  "Só lançamentos operacionais entram. Aportes, adiantamentos e devoluções a sócios ficam fora da margem.",
  "Resultado do período (KPIs, evolução, categorias, etapas): por data de competência. Acumulados (obras, grupos, avanço): tudo até o mês final do período.",
  "Vencimentos: o que está a pagar/receber a partir da data de geração, independente do período.",
];

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

function Cabecalho({ meta, continuacao }: { meta: MetaRelatorio; continuacao?: string }) {
  return (
    <View>
      <Text style={s.titulo}>{continuacao ? `${meta.titulo} - ${continuacao}` : meta.titulo}</Text>
      {!continuacao && <Text style={s.subtitulo}>{meta.filtros.map((f) => `${f.rotulo}: ${f.valor}`).join("  ·  ")}</Text>}
    </View>
  );
}

function Kpi({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiRotulo}>{rotulo}</Text>
      <Text style={s.kpiValor}>{valor}</Text>
      <Text style={s.kpiDetalhe}>{detalhe}</Text>
    </View>
  );
}

function Fatias({ titulo, fatias }: { titulo: string; fatias: DashboardDados["categorias"] }) {
  const total = fatias.reduce((a, f) => a + f.valor, 0);
  return (
    <View style={s.coluna}>
      <Text style={s.secao}>{titulo}</Text>
      <Tabela
        colunas={[
          { titulo: titulo.includes("categoria") ? "Categoria" : "Etapa", largura: 5 },
          { titulo: "Custo comprometido", largura: 3, direita: true },
          { titulo: "%", largura: 1.3, direita: true },
        ]}
        linhas={fatias.map((f) => [f.rotulo, brl(f.valor), total > 0 ? pct(Math.round((f.valor / total) * 10_000)) : "-"])}
        vazio="Sem custos no período."
      />
    </View>
  );
}

/** O relatório do painel em PDF (A4 paisagem): resumo, evolução, obras, grupos, rankings, avanço e vencimentos. */
export async function gerarPainelPdf(d: DashboardDados, meta: MetaRelatorio): Promise<Buffer> {
  const k = d.kpis;
  const periodo = meta.filtros.find((f) => f.rotulo === "Período")?.valor ?? "";
  const varias = new Set(d.obras.map((o) => o.empresaId)).size > 1;

  const paginasObras: DashboardDados["obras"][] = [];
  for (let i = 0; i < d.obras.length; i += LINHAS_POR_PAGINA) paginasObras.push(d.obras.slice(i, i + LINHAS_POR_PAGINA));
  if (paginasObras.length === 0) paginasObras.push([]);

  const totalObras = d.obras.reduce(
    (a, o) => ({ orcado: a.orcado + o.orcado, comprometido: a.comprometido + o.comprometido, incorrido: a.incorrido + o.incorrido, receita: a.receita + o.receitaRealizada, margem: a.margem + o.margemRealizada }),
    { orcado: 0, comprometido: 0, incorrido: 0, receita: 0, margem: 0 },
  );

  const documento = (
    <Document title={meta.titulo} author={meta.usuario} creator="RGO - Registro Geral de Obra" producer="RGO" language="pt-BR">
      {/* 1. Resumo e evolução */}
      <Page size="A4" orientation="landscape" style={s.pagina}>
        <Cabecalho meta={meta} />
        <View style={s.kpis}>
          <Kpi rotulo="Receita realizada" valor={brl(k.receitaRealizada)} detalhe={`A receber: ${brl(k.receitaAReceber)}`} />
          <Kpi rotulo="Custo realizado" valor={brl(k.custoRealizado)} detalhe={`A pagar: ${brl(k.custoAPagar)}`} />
          <Kpi
            rotulo="Margem realizada"
            valor={brl(k.margemRealizada)}
            detalhe={`${k.margemRealizadaBps === null ? "Sem receita no período" : `${pct(k.margemRealizadaBps)} da receita`} · projetada ${brl(k.margemProjetada)}${k.margemProjetadaBps === null ? "" : ` (${pct(k.margemProjetadaBps)})`}`}
          />
          <Kpi rotulo="Obras" valor={String(k.obrasTotal)} detalhe={`${k.obrasAtivas} ativa(s)`} />
        </View>

        <Text style={s.secao}>Receita, custo e margem por mês</Text>
        <Text style={s.nota}>Realizados (pagos e recebidos), por competência, {periodo}. Só lançamentos operacionais.</Text>
        <GraficoBarras
          pontos={d.evolucao.map((p) => ({ rotulo: rotuloMes(p.mes), valores: [p.receita, p.custo] }))}
          series={[
            { nome: "Receita realizada", cor: COR.verde },
            { nome: "Custo realizado", cor: COR.vermelho },
          ]}
          linha={{ nome: "Margem", cor: COR.azul, valores: d.evolucao.map((p) => p.margem) }}
          altura={d.evolucao.length <= 12 ? 135 : 200}
        />
        {d.evolucao.length <= 12 && (
          <View style={{ marginTop: 8 }}>
            <Tabela
              compacta
              colunas={[
                { titulo: "Mês", largura: 1.4 },
                { titulo: "Receita realizada", largura: 2.6, direita: true },
                { titulo: "Custo realizado", largura: 2.6, direita: true },
                { titulo: "Margem", largura: 2.6, direita: true },
                { titulo: "Custo a pagar", largura: 2.6, direita: true },
                { titulo: "Receita a receber", largura: 2.6, direita: true },
              ]}
              linhas={d.evolucao.map((p) => [rotuloMes(p.mes), brl(p.receita), brl(p.custo), brl(p.margem), brl(p.aPagar), brl(p.aReceber)])}
            />
          </View>
        )}
        <Rodape meta={meta} />
      </Page>

      {/* 2. Obras (várias páginas se preciso) */}
      {paginasObras.map((lote, i) => (
        <Page key={i} size="A4" orientation="landscape" style={s.pagina}>
          <Cabecalho meta={meta} continuacao={paginasObras.length > 1 ? `Obras (${i + 1}/${paginasObras.length})` : "Obras"} />
          <Text style={s.nota}>Orçado × comprometido × incorrido, acumulado até {rotuloMes(d.filtros.ate)}. Desvio positivo = acima do orçamento vigente.</Text>
          <Tabela
            colunas={[
              { titulo: "Obra", largura: varias ? 4.4 : 6.4 },
              ...(varias ? [{ titulo: "Empresa", largura: 2.8 }] : []),
              { titulo: "Orçado", largura: 3.1, direita: true },
              { titulo: "Comprometido", largura: 3.1, direita: true },
              { titulo: "% orç.", largura: 1.4, direita: true },
              { titulo: "Incorrido", largura: 3.1, direita: true },
              { titulo: "Desvio", largura: 3.4, direita: true },
              { titulo: "Receita real.", largura: 3.1, direita: true },
              { titulo: "Margem real.", largura: 3.3, direita: true },
              { titulo: "Proj. %", largura: 1.4, direita: true },
            ]}
            linhas={lote.map((o) => [
              `${o.codigo} - ${o.nome}${o.status === "ativa" ? "" : ` (${OBRA_STATUS_LABEL[o.status]})`}`,
              ...(varias ? [o.empresaNome] : []),
              brl(o.orcado),
              brl(o.comprometido),
              pct(o.pctComprometidoBps),
              brl(o.incorrido),
              o.orcado === 0 ? "sem orçamento" : `${sinal(o.desvio)}${brl(o.desvio)}${o.desvioBps === null ? "" : ` (${sinal(o.desvio)}${pct(o.desvioBps)})`}`,
              brl(o.receitaRealizada),
              `${brl(o.margemRealizada)}${o.margemRealizadaBps === null ? "" : ` (${pct(o.margemRealizadaBps)})`}`,
              pct(o.margemProjetadaBps),
            ])}
            total={
              i === paginasObras.length - 1 && d.obras.length > 0
                ? [
                    "Total",
                    ...(varias ? [""] : []),
                    brl(totalObras.orcado),
                    brl(totalObras.comprometido),
                    "",
                    brl(totalObras.incorrido),
                    "",
                    brl(totalObras.receita),
                    brl(totalObras.margem),
                    "",
                  ]
                : undefined
            }
            vazio="Nenhuma obra nos filtros escolhidos."
          />
          <Rodape meta={meta} />
        </Page>
      ))}

      {/* 3. Grupos de custo e rankings */}
      <Page size="A4" orientation="landscape" style={s.pagina}>
        <Cabecalho meta={meta} continuacao="Custos" />
        <Text style={s.secao}>Custo por grupo</Text>
        <Text style={s.nota}>Quanto do orçamento de cada grupo já está comprometido. Acumulado até {rotuloMes(d.filtros.ate)}.</Text>
        <Tabela
          colunas={[
            { titulo: "Grupo", largura: 4 },
            { titulo: "Orçado", largura: 2.6, direita: true },
            { titulo: "Comprometido", largura: 2.6, direita: true },
            { titulo: "% comprometido", largura: 2, direita: true },
            { titulo: "Incorrido (pago)", largura: 2.6, direita: true },
            { titulo: "% do orçamento", largura: 2, direita: true },
          ]}
          linhas={d.grupos.map((g) => [rotuloGrupo(g.grupo), brl(g.orcado), brl(g.comprometido), pct(g.pctComprometidoBps), brl(g.incorrido), pct(g.pctDoOrcadoBps)])}
          vazio="Sem orçamento nem custos nos filtros escolhidos."
        />
        <View style={[s.par, { marginTop: 4 }]}>
          <Fatias titulo="Custo por categoria" fatias={d.categorias} />
          <View style={{ width: 14 }} />
          <Fatias titulo="Custo por etapa" fatias={d.etapas} />
        </View>
        <Rodape meta={meta} />
      </Page>

      {/* 4. Avanço físico e vencimentos */}
      <Page size="A4" orientation="landscape" style={s.pagina}>
        <Cabecalho meta={meta} continuacao="Avanço e vencimentos" />
        <Text style={s.secao}>Avanço físico: planejado × realizado</Text>
        <Text style={s.nota}>Percentual acumulado até {rotuloMes(d.filtros.ate)}; mês de referência = último mês com avanço realizado informado.</Text>
        <Tabela
          colunas={[
            { titulo: "Obra", largura: 6 },
            { titulo: "Mês", largura: 1.6 },
            { titulo: "Planejado", largura: 1.8, direita: true },
            { titulo: "Realizado", largura: 1.8, direita: true },
            { titulo: "Desvio", largura: 1.8, direita: true },
          ]}
          linhas={d.avanco.map((o) =>
            o.atual
              ? [`${o.codigo} - ${o.nome}`, rotuloMes(o.atual.competencia.slice(0, 7)), pct(o.atual.planejadoAcumBps), pct(o.atual.realizadoAcumBps), o.atual.desvioAcumBps === null ? "-" : `${sinal(o.atual.desvioAcumBps)}${pct(o.atual.desvioAcumBps)}`]
              : [`${o.codigo} - ${o.nome}`, "-", "-", "só planejamento", "-"],
          )}
          vazio="Nenhum avanço físico informado nos filtros escolhidos."
        />

        <View style={[s.par, { marginTop: 4 }]}>
          {([["Contas a pagar por vencimento", d.aPagar], ["Contas a receber por vencimento", d.aReceber]] as const).map(([titulo, v]) => (
            <View key={titulo} style={[s.coluna, { marginRight: 10 }]}>
              <Text style={s.secao}>{titulo}</Text>
              <Text style={s.nota}>Dias a partir de hoje, com e sem título de previsão.</Text>
              <GraficoBarras
                largura={370}
                altura={150}
                empilhar
                pontos={v.faixas.map((f) => ({ rotulo: FAIXAS_VENCIMENTO.find((x) => x.id === f.faixa)?.curto ?? f.rotulo, valores: [f.efetivo, f.previsao] }))}
                series={[
                  { nome: "Títulos efetivos", cor: COR.azul },
                  { nome: "Títulos de previsão", cor: COR.ambar },
                ]}
              />
              <Text style={[s.nota, { marginTop: 3 }]}>
                Total a vencer: {brl(v.faixas.reduce((a, f) => a + f.efetivo + f.previsao, 0))}
                {v.semVencimento !== 0 ? ` · sem data de vencimento: ${brl(v.semVencimento)} (fora das faixas)` : ""}
              </Text>
            </View>
          ))}
        </View>
        <Rodape meta={meta} />
      </Page>

      {/* 5. Fora da margem e definições */}
      <Page size="A4" orientation="landscape" style={s.pagina}>
        <Cabecalho meta={meta} continuacao="Fora da margem e definições" />
        <Text style={s.secao}>Fora da margem</Text>
        <Text style={s.nota}>Movimentos de caixa do período que não entram em custo, receita nem margem.</Text>
        <Tabela
          colunas={[
            { titulo: "Classe", largura: 4 },
            { titulo: "Sentido", largura: 2 },
            { titulo: "Valor realizado no período", largura: 3, direita: true },
          ]}
          linhas={d.foraDaMargem.map((f) => [LANCAMENTO_CLASSE_LABEL[f.classe], f.tipo === "receita" ? "Entrada" : "Saída", brl(f.valor)])}
          vazio="Nenhum movimento no período."
        />
        <Text style={s.secao}>Como os números são calculados</Text>
        {DEFINICOES.map((t) => (
          <Text key={t} style={{ marginBottom: 3 }}>
            · {t}
          </Text>
        ))}
        <Rodape meta={meta} />
      </Page>
    </Document>
  );

  return renderToBuffer(documento);
}
