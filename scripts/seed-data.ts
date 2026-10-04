/**
 * Geração PURA dos dados fictícios (sem banco): determinística, para o seed ser reproduzível e
 * testável. Valores em centavos (inteiros).
 */
import type { CategoriaGrupo, LancamentoClasse, LancamentoSituacao, LancamentoTipo, ObraStatus } from "../src/lib/domain";

/** Hoje, para o cenário: o seed assume que setembro/2026 é o último mês fechado. */
export const HOJE = "2026-10-04";

export type EmpresaSeed = { key: string; id: string; nome: string; razaoSocial: string; cnpj: string };

export const EMPRESAS: EmpresaSeed[] = [
  { key: "aurora", id: "demo-aurora", nome: "Construtora Aurora", razaoSocial: "Aurora Construções e Incorporações Ltda", cnpj: "11222333000181" },
  { key: "horizonte", id: "demo-horizonte", nome: "Engenharia Horizonte", razaoSocial: "Horizonte Engenharia S.A.", cnpj: "45997418000153" },
  { key: "vertice", id: "demo-vertice", nome: "Incorporadora Vértice", razaoSocial: "Vértice Empreendimentos Imobiliários Ltda", cnpj: "12ABC34501DE35" },
];

export type ObraSeed = {
  empresa: string;
  codigo: string;
  nome: string;
  status: ObraStatus;
  /** "YYYY-MM" do primeiro mês de obra. */
  inicio: string;
  meses: number;
  cidade: string;
  uf: string;
  orcamentoReais: number;
  receitaReais: number;
  /** Desvio de custo sobre o orçamento (0,05 = 5% acima). */
  desvio: number;
  /** Atraso físico em relação ao planejado (0,1 = 10% menos avanço). */
  atraso: number;
  /** Mês em que parou (obra pausada). */
  paradaEm?: string;
};

export const OBRAS: ObraSeed[] = [
  { empresa: "aurora", codigo: "AUR-001", nome: "Residencial Jardim das Acácias", status: "ativa", inicio: "2025-01", meses: 24, cidade: "Campinas", uf: "SP", orcamentoReais: 18_500_000, receitaReais: 23_800_000, desvio: 0.03, atraso: 0.04 },
  { empresa: "aurora", codigo: "AUR-002", nome: "Edifício Comercial Torre Central", status: "ativa", inicio: "2025-06", meses: 30, cidade: "São Paulo", uf: "SP", orcamentoReais: 42_000_000, receitaReais: 54_000_000, desvio: 0.09, atraso: 0.12 },
  { empresa: "aurora", codigo: "AUR-003", nome: "Galpão Logístico Rodovia", status: "concluida", inicio: "2024-10", meses: 15, cidade: "Jundiaí", uf: "SP", orcamentoReais: 9_200_000, receitaReais: 11_000_000, desvio: -0.02, atraso: 0 },
  { empresa: "horizonte", codigo: "HOR-001", nome: "Condomínio Vila Verde", status: "ativa", inicio: "2024-10", meses: 36, cidade: "Belo Horizonte", uf: "MG", orcamentoReais: 31_000_000, receitaReais: 40_000_000, desvio: 0.01, atraso: 0.02 },
  { empresa: "horizonte", codigo: "HOR-002", nome: "Hospital Regional Norte", status: "ativa", inicio: "2025-09", meses: 28, cidade: "Contagem", uf: "MG", orcamentoReais: 68_000_000, receitaReais: 82_000_000, desvio: 0.06, atraso: 0.07 },
  { empresa: "horizonte", codigo: "HOR-003", nome: "Ponte sobre o Rio Claro", status: "pausada", inicio: "2025-03", meses: 20, cidade: "Uberaba", uf: "MG", orcamentoReais: 15_000_000, receitaReais: 17_500_000, desvio: 0.12, atraso: 0.2, paradaEm: "2026-05" },
  { empresa: "vertice", codigo: "VER-001", nome: "Residencial Vértice Park", status: "ativa", inicio: "2025-11", meses: 22, cidade: "Curitiba", uf: "PR", orcamentoReais: 22_000_000, receitaReais: 29_000_000, desvio: -0.01, atraso: 0.01 },
  { empresa: "vertice", codigo: "VER-002", nome: "Loteamento Bosque Azul", status: "planejada", inicio: "2026-11", meses: 18, cidade: "Londrina", uf: "PR", orcamentoReais: 12_000_000, receitaReais: 16_000_000, desvio: 0, atraso: 0 },
];

export const ETAPAS = [
  { codigo: "01", nome: "Serviços preliminares", peso: 0.04 },
  { codigo: "02", nome: "Fundação", peso: 0.14 },
  { codigo: "03", nome: "Estrutura", peso: 0.28 },
  { codigo: "04", nome: "Alvenaria e vedação", peso: 0.16 },
  { codigo: "05", nome: "Instalações", peso: 0.18 },
  { codigo: "06", nome: "Acabamento", peso: 0.2 },
] as const;

export const SUBETAPAS = [
  { pai: "03", codigo: "03.1", nome: "Formas e armação" },
  { pai: "03", codigo: "03.2", nome: "Concretagem" },
  { pai: "05", codigo: "05.1", nome: "Hidráulica" },
  { pai: "05", codigo: "05.2", nome: "Elétrica" },
] as const;

/** Grupos de custo e a fatia de cada um no custo total. */
export const GRUPOS: { grupo: CategoriaGrupo; nome: string; fatia: number; fornecedores: string[] }[] = [
  { grupo: "material", nome: "Materiais de construção", fatia: 0.38, fornecedores: ["Cimento Forte", "Aço Brasil", "Madeiras Planalto", "Distribuidora Sul Materiais", "Concreteira Mix"] },
  { grupo: "maquinas_equipamentos", nome: "Locação de máquinas e equipamentos", fatia: 0.12, fornecedores: ["Locamax Equipamentos", "Gruas & Cia", "Andaimes Seguros"] },
  { grupo: "mao_obra_direta", nome: "Mão de obra direta", fatia: 0.22, fornecedores: ["Folha de pagamento - obra", "Empreiteira Santos", "Equipe Alvenaria Lima"] },
  { grupo: "mao_obra_indireta", nome: "Mão de obra indireta", fatia: 0.08, fornecedores: ["Folha - engenharia e apoio", "Segurança do Trabalho Ltda"] },
  { grupo: "servicos", nome: "Serviços de terceiros", fatia: 0.15, fornecedores: ["Projetos Estruturais SA", "Instaladora Elétrica Volt", "Hidráulica Norte", "Topografia Exata"] },
  { grupo: "outros", nome: "Despesas administrativas", fatia: 0.05, fornecedores: ["Seguradora Obra", "Consultoria Jurídica", "Taxas e licenças"] },
];

export type LancamentoSeed = {
  etapaCodigo: string;
  categoriaGrupo: CategoriaGrupo | "receita";
  tipo: LancamentoTipo;
  situacao: LancamentoSituacao;
  classe: LancamentoClasse;
  isPrevisao: boolean;
  valorCentavos: number;
  dataCompetencia: string;
  dataVencimento: string | null;
  dataLiquidacao: string | null;
  contraparte: string;
  documento: string;
  descricao: string;
  origem: "manual" | "planilha";
  idOrigem: string | null;
};

export type OrcamentoSeed = { etapaCodigo: string | null; categoriaGrupo: CategoriaGrupo; valorCentavos: number };
export type AvancoSeed = { competencia: string; tipo: "planejado" | "realizado"; pctMesBps: number; pctAcumBps: number };

// ---------- utilitários determinísticos ----------

/** PRNG mulberry32: mesma semente, mesma sequência. */
export function prng(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashTexto(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function somaMeses(anoMes: string, n: number): string {
  const [a, m] = anoMes.split("-").map(Number) as [number, number];
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function somaDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

const ultimoDiaDoMes = (anoMes: string) => {
  const [a, m] = anoMes.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};

/** Curva S suave: fração acumulada do trabalho em x (0..1). */
export const curvaS = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

const reais = (v: number) => Math.round(v * 100);

// ---------- geração por obra ----------

export function gerarObra(obra: ObraSeed) {
  const rnd = prng(hashTexto(obra.codigo));
  const mesHoje = HOJE.slice(0, 7);
  const ultimoMesFechado = somaMeses(mesHoje, -1);
  const lancamentos: LancamentoSeed[] = [];
  const avanco: AvancoSeed[] = [];
  const orcamento: OrcamentoSeed[] = [];

  // Orçamento: etapa × grupo (materiais, máquinas, MOD, serviços) + MOI e outros sem etapa.
  const custoTotal = reais(obra.orcamentoReais);
  for (const g of GRUPOS) {
    const totalGrupo = Math.round(custoTotal * g.fatia);
    if (g.grupo === "mao_obra_indireta" || g.grupo === "outros") {
      orcamento.push({ etapaCodigo: null, categoriaGrupo: g.grupo, valorCentavos: totalGrupo });
      continue;
    }
    let restante = totalGrupo;
    ETAPAS.forEach((e, i) => {
      const valor = i === ETAPAS.length - 1 ? restante : Math.round(totalGrupo * e.peso);
      restante -= valor;
      orcamento.push({ etapaCodigo: e.codigo, categoriaGrupo: g.grupo, valorCentavos: valor });
    });
  }

  if (obra.status === "planejada") return { lancamentos, avanco, orcamento };

  const planejado = (t: number) => curvaS(t / obra.meses);
  let realizadoAnt = 0;
  let planejadoAnt = 0;
  let idSeq = 0;

  for (let t = 1; t <= obra.meses; t++) {
    const mes = somaMeses(obra.inicio, t - 1);
    const fechado = mes <= ultimoMesFechado;
    const parada = obra.paradaEm !== undefined && mes > obra.paradaEm;

    // Avanço físico (planejado existe para todos os meses; realizado só até o mês fechado).
    const planAcum = planejado(t);
    avanco.push({
      competencia: `${mes}-01`,
      tipo: "planejado",
      pctMesBps: Math.round((planAcum - planejadoAnt) * 10_000),
      pctAcumBps: Math.round(planAcum * 10_000),
    });
    const planMes = planAcum - planejadoAnt;
    planejadoAnt = planAcum;

    if (!fechado) continue;

    const ritmo = parada ? 0 : 1 - obra.atraso * (0.6 + rnd() * 0.8);
    const realAcum = Math.min(1, realizadoAnt + planMes * ritmo);
    const realMes = realAcum - realizadoAnt;
    realizadoAnt = realAcum;
    avanco.push({
      competencia: `${mes}-01`,
      tipo: "realizado",
      pctMesBps: Math.round(realMes * 10_000),
      pctAcumBps: Math.round(realAcum * 10_000),
    });
    if (realMes <= 0.0001) continue;

    // Custos do mês: proporcionais ao avanço, com desvio e ruído.
    const etapaIdx = Math.min(ETAPAS.length - 1, Math.floor(realAcum * ETAPAS.length));
    for (const g of GRUPOS) {
      const base = custoTotal * g.fatia * realMes * (1 + obra.desvio);
      const n = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const valor = reais((base / n / 100) * (0.85 + rnd() * 0.3));
        if (valor <= 0) continue;
        const dia = 3 + Math.floor(rnd() * 24);
        const comp = `${mes}-${String(dia).padStart(2, "0")}`;
        const pago = somaDias(comp, 10 + Math.floor(rnd() * 20));
        const liquidacao = pago > HOJE ? somaDias(HOJE, -1) : pago;
        const forn = g.fornecedores[Math.floor(rnd() * g.fornecedores.length)]!;
        const origem = rnd() < 0.55 ? "planilha" : "manual";
        idSeq++;
        lancamentos.push({
          etapaCodigo: ETAPAS[Math.max(0, Math.min(ETAPAS.length - 1, etapaIdx + (rnd() < 0.3 ? -1 : 0)))]!.codigo,
          categoriaGrupo: g.grupo,
          tipo: "custo",
          situacao: "realizado",
          classe: "operacional",
          isPrevisao: false,
          valorCentavos: valor,
          dataCompetencia: comp,
          dataVencimento: pago,
          dataLiquidacao: liquidacao,
          contraparte: forn,
          documento: `NF ${1000 + Math.floor(rnd() * 8999)}`,
          descricao: `${g.nome} - ${mes}`,
          origem,
          idOrigem: origem === "planilha" ? `${obra.codigo}-${mes}-${idSeq}` : null,
        });
      }
    }

    // Receita: medição proporcional ao avanço, recebida ~20 dias depois.
    const medicao = reais(obra.receitaReais * realMes * (0.97 + rnd() * 0.06));
    if (medicao > 0) {
      const comp = `${mes}-${String(ultimoDiaDoMes(mes)).padStart(2, "0")}`;
      const rec = somaDias(comp, 20);
      idSeq++;
      lancamentos.push({
        etapaCodigo: ETAPAS[etapaIdx]!.codigo,
        categoriaGrupo: "receita",
        tipo: "receita",
        situacao: rec <= HOJE ? "realizado" : "a_realizar",
        classe: "operacional",
        isPrevisao: false,
        valorCentavos: medicao,
        dataCompetencia: comp,
        dataVencimento: rec,
        dataLiquidacao: rec <= HOJE ? rec : null,
        contraparte: "Medição mensal - contratante",
        documento: `MED ${mes}`,
        descricao: `Medição ${mes}`,
        origem: "planilha",
        idOrigem: `${obra.codigo}-MED-${mes}-${idSeq}`,
      });
    }

  }

  // Aporte e devolução a sócios (movimentos de caixa que NÃO entram na margem).
  if (obra.codigo === "AUR-002" || obra.codigo === "HOR-002") {
    const comp = somaMeses(ultimoMesFechado, -4);
    lancamentos.push(
      {
        etapaCodigo: "01", categoriaGrupo: "receita", tipo: "receita", situacao: "realizado", classe: "aporte", isPrevisao: false,
        valorCentavos: reais(obra.orcamentoReais * 0.05), dataCompetencia: `${comp}-05`, dataVencimento: `${comp}-05`, dataLiquidacao: `${comp}-05`,
        contraparte: "Sócios", documento: "APORTE", descricao: "Aporte de capital dos sócios", origem: "manual", idOrigem: null,
      },
      {
        etapaCodigo: "01", categoriaGrupo: "outros", tipo: "custo", situacao: "realizado", classe: "devolucao_socio", isPrevisao: false,
        valorCentavos: reais(obra.orcamentoReais * 0.01), dataCompetencia: `${ultimoMesFechado}-10`, dataVencimento: `${ultimoMesFechado}-10`, dataLiquidacao: `${ultimoMesFechado}-10`,
        contraparte: "Sócios", documento: "DEVOL", descricao: "Devolução parcial de aporte", origem: "manual", idOrigem: null,
      },
    );
  }

  // Contas a pagar/receber futuras (faixas de 30/45/60/90/120 dias), só para obras em andamento.
  // O total futuro respeita o saldo de orçamento/contrato que ainda resta (com o desvio da obra).
  if (obra.status === "ativa") {
    const operacional = lancamentos.filter((l) => l.classe === "operacional");
    const gastoAteAqui = operacional.filter((l) => l.tipo === "custo").reduce((s, l) => s + l.valorCentavos, 0);
    const recebidoAteAqui = operacional.filter((l) => l.tipo === "receita").reduce((s, l) => s + l.valorCentavos, 0);
    const restanteCusto = Math.max(0, Math.round(custoTotal * (1 + obra.desvio)) - gastoAteAqui);
    const restanteReceita = Math.max(0, reais(obra.receitaReais) - recebidoAteAqui);
    const mensalCusto = (custoTotal * (1 + obra.desvio)) / obra.meses;
    const custoFuturo = Math.min(restanteCusto, Math.round(mensalCusto * 4.5));
    const receitaFutura = Math.min(restanteReceita, Math.round((reais(obra.receitaReais) / obra.meses) * 4.5));

    const prazos = [12, 28, 40, 55, 75, 100, 118];
    const grupos = GRUPOS.slice(0, 5);
    const pesosCusto = prazos.flatMap((_, i) => grupos.map((g) => ({ i, g, w: g.fatia * (0.5 + rnd() * 0.5) })));
    const somaPesosCusto = pesosCusto.reduce((acc, p) => acc + p.w, 0);
    const pesosReceita = prazos.map(() => 0.6 + rnd() * 0.5);
    const somaPesosReceita = pesosReceita.reduce((acc, w) => acc + w, 0);

    prazos.forEach((dias, i) => {
      const venc = somaDias(HOJE, dias);
      for (const { g, w } of pesosCusto.filter((p) => p.i === i)) {
        const valor = Math.round((custoFuturo * w) / somaPesosCusto);
        if (valor <= 0) continue;
        idSeq++;
        lancamentos.push({
          etapaCodigo: ETAPAS[Math.min(ETAPAS.length - 1, 2 + Math.floor(i / 3))]!.codigo,
          categoriaGrupo: g.grupo,
          tipo: "custo",
          situacao: "a_realizar",
          classe: "operacional",
          isPrevisao: i >= 4 || rnd() < 0.2,
          valorCentavos: valor,
          dataCompetencia: `${venc.slice(0, 7)}-01`,
          dataVencimento: venc,
          dataLiquidacao: null,
          contraparte: g.fornecedores[i % g.fornecedores.length]!,
          documento: i >= 4 ? "PREVISÃO" : `NF ${2000 + idSeq}`,
          descricao: `${g.nome} - vencimento ${venc}`,
          origem: "planilha",
          idOrigem: `${obra.codigo}-AP-${idSeq}`,
        });
      }
      const medicao = Math.round((receitaFutura * pesosReceita[i]!) / somaPesosReceita);
      if (medicao > 0) {
        idSeq++;
        lancamentos.push({
          etapaCodigo: "03", categoriaGrupo: "receita", tipo: "receita", situacao: "a_realizar", classe: "operacional", isPrevisao: false,
          valorCentavos: medicao, dataCompetencia: `${venc.slice(0, 7)}-01`, dataVencimento: venc, dataLiquidacao: null,
          contraparte: "Medição futura - contratante", documento: `MED-F${i}`, descricao: `Medição prevista ${venc}`,
          origem: "planilha", idOrigem: `${obra.codigo}-AR-${idSeq}`,
        });
      }
    });
  }

  return { lancamentos, avanco, orcamento };
}
