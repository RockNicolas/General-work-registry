import { Font, G, Line, Polyline, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { formatBRLCompact } from "@/lib/money";

/**
 * Peças do relatório em PDF. Só usa fontes padrão do PDF (Helvetica, codificação WinAnsi): então os
 * textos precisam ficar em Latin-1 (acentos pt-BR ok; nada de "−", "→", "≥").
 */

// Sem hifenização automática: "Horizonte" não deve virar "Hori-zonte" numa célula estreita.
Font.registerHyphenationCallback((palavra) => [palavra]);

export const COR = {
  tinta: "#1f2937",
  suave: "#6b7280",
  linha: "#e5e7eb",
  zebra: "#f8fafc",
  cabecalho: "#1f2937",
  azul: "#3b6fd4",
  verde: "#3da565",
  ambar: "#e0a526",
  vermelho: "#d9534f",
};

export const s = StyleSheet.create({
  pagina: { padding: 28, paddingBottom: 40, fontFamily: "Helvetica", fontSize: 8.5, color: COR.tinta },
  rodape: { position: "absolute", left: 28, right: 28, bottom: 16, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: COR.suave },
  titulo: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  subtitulo: { fontSize: 8, color: COR.suave, marginTop: 2 },
  secao: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 2 },
  nota: { fontSize: 7.5, color: COR.suave, marginBottom: 5 },
  kpis: { flexDirection: "row", marginTop: 10 },
  kpi: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: COR.linha, borderRadius: 4, padding: 7, marginRight: 8 },
  kpiRotulo: { fontSize: 7.5, color: COR.suave },
  kpiValor: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 2 },
  kpiDetalhe: { fontSize: 7, color: COR.suave, marginTop: 2 },
  thead: { flexDirection: "row", backgroundColor: COR.cabecalho, color: "#ffffff", paddingVertical: 4, paddingHorizontal: 3 },
  tr: { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 3, borderBottomWidth: 0.5, borderBottomColor: COR.linha },
  linhaTotal: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 3, borderTopWidth: 1, borderTopColor: COR.tinta, fontFamily: "Helvetica-Bold" },
  par: { flexDirection: "row" },
  coluna: { flexGrow: 1, flexBasis: 0 },
});

/** Intl usa espaço não separável em "R$ 1,00"; no PDF vira espaço comum. */
export const texto = (t: string): string => t.replace(/ /g, " ");

export type Col = { titulo: string; largura: number; direita?: boolean };

/** Tabela simples: cabeçalho escuro, linhas zebradas que não se partem entre páginas. */
export function Tabela({
  colunas,
  linhas,
  total,
  vazio = "Sem dados nos filtros escolhidos.",
  compacta = false,
}: {
  colunas: Col[];
  linhas: (string | ReactNode)[][];
  total?: string[];
  vazio?: string;
  /** Linhas mais baixas, para tabelas que precisam caber numa página com outros blocos. */
  compacta?: boolean;
}) {
  const soma = colunas.reduce((a, c) => a + c.largura, 0);
  const estilo = (c: Col) => ({ width: `${(c.largura / soma) * 100}%`, textAlign: c.direita ? ("right" as const) : ("left" as const), paddingRight: 3 });
  return (
    <View>
      <View style={s.thead} wrap={false}>
        {colunas.map((c) => (
          <Text key={c.titulo} style={estilo(c)}>
            {c.titulo}
          </Text>
        ))}
      </View>
      {linhas.length === 0 && <Text style={{ padding: 6, color: COR.suave }}>{vazio}</Text>}
      {linhas.map((l, i) => (
        <View key={i} style={[s.tr, compacta ? { paddingVertical: 1.8 } : {}, i % 2 === 1 ? { backgroundColor: COR.zebra } : {}]} wrap={false}>
          {l.map((celula, j) => (
            <Text key={j} style={estilo(colunas[j]!)}>
              {celula}
            </Text>
          ))}
        </View>
      ))}
      {total && (
        <View style={s.linhaTotal} wrap={false}>
          {total.map((celula, j) => (
            <Text key={j} style={estilo(colunas[j]!)}>
              {celula}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export type Serie = { nome: string; cor: string };
export type PontoBarras = { rotulo: string; valores: number[] };

/**
 * Barras agrupadas (ou empilhadas) em SVG, com eixo em R$ compacto e, opcionalmente, uma linha
 * (ex.: margem). Aceita valores negativos (a base do gráfico é o zero).
 */
export function GraficoBarras({
  pontos,
  series,
  linha,
  largura = 760,
  altura = 170,
  empilhar = false,
}: {
  pontos: PontoBarras[];
  series: Serie[];
  linha?: { nome: string; cor: string; valores: number[] };
  largura?: number;
  altura?: number;
  empilhar?: boolean;
}) {
  const margemE = 54;
  const margemB = 22;
  const margemT = 10;
  const w = largura - margemE - 6;
  const h = altura - margemB - margemT;

  const topos = pontos.map((p) => (empilhar ? p.valores.filter((v) => v > 0).reduce((a, v) => a + v, 0) : Math.max(0, ...p.valores)));
  const fundos = pontos.map((p) => (empilhar ? p.valores.filter((v) => v < 0).reduce((a, v) => a + v, 0) : Math.min(0, ...p.valores)));
  const todos = [...topos, ...fundos, ...(linha?.valores ?? [])];
  const max = Math.max(1, ...todos, 0);
  const min = Math.min(0, ...todos);
  const faixa = max - min || 1;
  const y = (v: number) => margemT + h - ((v - min) / faixa) * h;
  const zero = y(0);

  const n = Math.max(1, pontos.length);
  const grupo = w / n;
  const nSeries = empilhar ? 1 : Math.max(1, series.length);
  const largBarra = Math.min(26, (grupo * 0.7) / nSeries);
  const passoRotulo = Math.ceil(n / 14);
  const ticks = [0, 1, 2, 3, 4].map((i) => min + (faixa * i) / 4);

  return (
    <View>
      <Svg width={largura} height={altura}>
        {ticks.map((t) => (
          <Line key={t} x1={margemE} x2={margemE + w} y1={y(t)} y2={y(t)} stroke={COR.linha} strokeWidth={0.5} />
        ))}
        {ticks.map((t) => (
          <Text key={`l${t}`} x={margemE - 4} y={y(t) + 2.5} fill={COR.suave} textAnchor="end" style={{ fontSize: 6.5 }}>
            {texto(formatBRLCompact(t))}
          </Text>
        ))}
        {pontos.map((p, i) => {
          const x0 = margemE + i * grupo + (grupo - largBarra * nSeries) / 2;
          let acumPos = 0;
          let acumNeg = 0;
          return (
            <G key={p.rotulo + i}>
              {p.valores.map((v, k) => {
                const cor = series[k]?.cor ?? COR.azul;
                let topo: number;
                let base: number;
                let x = x0 + (empilhar ? 0 : k * largBarra);
                if (empilhar) {
                  if (v >= 0) {
                    base = acumPos;
                    acumPos += v;
                    topo = acumPos;
                  } else {
                    topo = acumNeg;
                    acumNeg += v;
                    base = acumNeg;
                  }
                } else {
                  topo = Math.max(v, 0);
                  base = Math.min(v, 0);
                }
                x = Math.round(x * 100) / 100;
                const yTopo = y(topo);
                const yBase = y(base);
                return <Rect key={k} x={x} y={yTopo} width={largBarra} height={Math.max(0, yBase - yTopo)} fill={cor} />;
              })}
            </G>
          );
        })}
        {pontos.map((p, i) =>
          i % passoRotulo === 0 ? (
            <Text key={`x${i}`} x={margemE + i * grupo + grupo / 2} y={altura - 8} fill={COR.suave} textAnchor="middle" style={{ fontSize: 6.5 }}>
              {p.rotulo}
            </Text>
          ) : null,
        )}
        <Line x1={margemE} x2={margemE + w} y1={zero} y2={zero} stroke={COR.suave} strokeWidth={0.7} />
        {linha && linha.valores.length > 1 && (
          <Polyline points={linha.valores.map((v, i) => `${margemE + i * grupo + grupo / 2},${y(v)}`).join(" ")} stroke={linha.cor} strokeWidth={1.4} fill="none" />
        )}
      </Svg>
      <View style={{ flexDirection: "row", marginTop: 2, marginLeft: margemE }}>
        {[...series, ...(linha ? [{ nome: linha.nome, cor: linha.cor }] : [])].map((se) => (
          <View key={se.nome} style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
            <View style={{ width: 7, height: 7, backgroundColor: se.cor, marginRight: 3 }} />
            <Text style={{ fontSize: 7, color: COR.suave }}>{se.nome}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
