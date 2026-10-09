import { agruparPorFaixa } from "@/features/dashboards/faixas";
import type { DashboardDados, LinhaObra } from "@/features/dashboards/queries";

/** Uma obra com números redondos e conhecidos (para conferir arquivos exportados). */
export function obraExemplo(i: number, extra: Partial<LinhaObra> = {}): LinhaObra {
  const orcado = 1_000_000 * (i + 1);
  const comprometido = 400_000 * (i + 1);
  const incorrido = 300_000 * (i + 1);
  const receitaRealizada = 500_000 * (i + 1);
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    codigo: `OB-${String(i + 1).padStart(3, "0")}`,
    nome: `Obra de exemplo ${i + 1}`,
    empresaId: i % 2 === 0 ? "emp-a" : "emp-b",
    empresaNome: i % 2 === 0 ? "Construtora Alfa" : "Construtora Beta",
    status: "ativa",
    orcado,
    comprometido,
    incorrido,
    pctComprometidoBps: 4000,
    desvio: comprometido - orcado,
    desvioBps: -6000,
    receitaRealizada,
    receitaTotal: receitaRealizada + 100_000,
    margemRealizada: receitaRealizada - incorrido,
    margemRealizadaBps: Math.round(((receitaRealizada - incorrido) / receitaRealizada) * 10_000),
    margemProjetada: receitaRealizada + 100_000 - comprometido,
    margemProjetadaBps: 3333,
    ...extra,
  };
}

/** Dashboard completo e determinístico com `obras` obras e `meses` meses de evolução. */
export function dashboardExemplo(obras = 3, meses = 3): DashboardDados {
  const mesesLista = Array.from({ length: meses }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
  return {
    filtros: { de: mesesLista[0]!, ate: mesesLista[meses - 1]!, empresaId: undefined, obraId: undefined, grupo: undefined },
    hoje: "2026-03-15",
    kpis: {
      receitaRealizada: 800_000,
      receitaAReceber: 300_000,
      custoRealizado: 250_000,
      custoAPagar: 170_000,
      margemRealizada: 550_000,
      margemRealizadaBps: 6875,
      margemProjetada: 680_000,
      margemProjetadaBps: 6182,
      obrasAtivas: obras,
      obrasTotal: obras,
    },
    evolucao: mesesLista.map((mes, i) => ({ mes, receita: 100_000 * (i + 1), custo: 60_000 * (i + 1), aPagar: 10_000 * i, aReceber: 5_000 * i, margem: 40_000 * (i + 1) })),
    obras: Array.from({ length: obras }, (_, i) => obraExemplo(i)),
    grupos: [
      { grupo: "material", orcado: 1_000_000, comprometido: 350_000, incorrido: 250_000, pctComprometidoBps: 3500, pctDoOrcadoBps: 8000 },
      { grupo: "sem_categoria", orcado: 250_000, comprometido: 0, incorrido: 0, pctComprometidoBps: 0, pctDoOrcadoBps: 2000 },
    ],
    categorias: [
      { rotulo: "Materiais de construção", valor: 350_000 },
      { rotulo: "Mão de obra direta", valor: 70_000 },
    ],
    etapas: [
      { rotulo: "Fundação", valor: 200_000 },
      { rotulo: "Sem etapa", valor: 220_000 },
    ],
    avanco: [
      {
        obraId: "00000000-0000-4000-8000-000000000000",
        codigo: "OB-001",
        nome: "Obra de exemplo 1",
        serie: [
          { competencia: "2026-01-01", planejadoMesBps: 1000, planejadoAcumBps: 1000, realizadoMesBps: 800, realizadoAcumBps: 800, desvioAcumBps: -200 },
          { competencia: "2026-02-01", planejadoMesBps: 1500, planejadoAcumBps: 2500, realizadoMesBps: 1200, realizadoAcumBps: 2000, desvioAcumBps: -500 },
        ],
        atual: { competencia: "2026-02-01", planejadoMesBps: 1500, planejadoAcumBps: 2500, realizadoMesBps: 1200, realizadoAcumBps: 2000, desvioAcumBps: -500 },
      },
    ],
    aPagar: agruparPorFaixa([
      { dias: 10, isPrevisao: false, valor: 100_000 },
      { dias: 50, isPrevisao: true, valor: 70_000 },
      { dias: null, isPrevisao: false, valor: 5_000 },
    ]),
    aReceber: agruparPorFaixa([{ dias: 40, isPrevisao: false, valor: 300_000 }]),
    foraDaMargem: [{ classe: "aporte", tipo: "receita", valor: 500_000 }],
  };
}

export const metaExemplo = {
  titulo: "Painel de indicadores",
  geradoEm: new Date("2026-03-15T15:30:00Z"),
  usuario: "Ana Admin",
  filtros: [
    { rotulo: "Período", valor: "jan/2026 a mar/2026" },
    { rotulo: "Empresa", valor: "Todas as que você acompanha" },
    { rotulo: "Obra", valor: "Todas as obras" },
    { rotulo: "Grupo de custo", valor: "Todos os grupos" },
  ],
};
