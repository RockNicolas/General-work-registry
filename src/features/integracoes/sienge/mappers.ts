import type { CategoriaGrupo } from "@/lib/domain";
import type { AvancoErp, LancamentoErp, OrcamentoErp } from "../erp/tipos";
import type { ItemOrcamento, ParcelaPagar, ParcelaReceber } from "./schemas";

/**
 * Conversão (pura) do formato do Sienge para os tipos internos. Sem rede e sem banco: tudo aqui é
 * testável com payloads de exemplo.
 */
export type OpcoesMapeamento = {
  /** Qual valor da baixa conta como "realizado": líquido (desembolsado) ou bruto. */
  valorPagamento: "liquido" | "bruto";
};

export const OPCOES_PADRAO: OpcoesMapeamento = { valorPagamento: "liquido" };

/** Reais (double do JSON) → centavos inteiros. */
export function paraCentavos(valor: number | null | undefined): number {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return 0;
  return Math.round(valor * 100);
}

/**
 * Divide `total` (centavos) proporcionalmente aos `pesos`, SEM perder nem criar centavos:
 * método do maior resto. A soma do resultado é sempre exatamente `total`.
 */
export function ratear(total: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  const soma = pesos.reduce((a, b) => a + b, 0);
  const proporcoes = soma > 0 ? pesos.map((p) => p / soma) : pesos.map(() => 1 / pesos.length);

  const sinal = total < 0 ? -1 : 1;
  const absoluto = Math.abs(total);
  const exatos = proporcoes.map((p) => absoluto * p);
  const base = exatos.map(Math.floor);
  let resto = absoluto - base.reduce((a, b) => a + b, 0);

  const ordem = exatos.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of ordem) {
    if (resto <= 0) break;
    base[i]! += 1;
    resto -= 1;
  }
  return base.map((v) => v * sinal);
}

const texto = (v: string | null | undefined) => (v && v.trim() !== "" ? v.trim() : null);
const dataISO = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);

type Apropriacao = {
  costCenterId?: number | null;
  financialCategoryId?: string | null;
  financialCategoryName?: string | null;
  financialCategoryRate?: number | null;
};

type Alocacao = { obraOrigemId: string; categoriaCodigo: string; categoriaNome: string; peso: number };

const SEM_CATEGORIA = { codigo: "SEM-PLANO", nome: "Sem plano financeiro" };

/** Agrupa as apropriações por (centro de custo, plano financeiro), somando percentuais repetidos. */
function alocacoesDe(apropriacoes: Apropriacao[] | null | undefined): Alocacao[] {
  const grupos = new Map<string, Alocacao>();
  for (const a of apropriacoes ?? []) {
    if (a.costCenterId === null || a.costCenterId === undefined) continue;
    const codigo = texto(a.financialCategoryId) ?? SEM_CATEGORIA.codigo;
    const chave = `${a.costCenterId}|${codigo}`;
    const atual = grupos.get(chave);
    const peso = a.financialCategoryRate ?? 0;
    if (atual) atual.peso += peso;
    else
      grupos.set(chave, {
        obraOrigemId: String(a.costCenterId),
        categoriaCodigo: codigo,
        categoriaNome: texto(a.financialCategoryName) ?? (codigo === SEM_CATEGORIA.codigo ? SEM_CATEGORIA.nome : codigo),
        peso,
      });
  }
  return [...grupos.values()];
}

type Corrente = { chave: string; valorCentavos: number; situacao: "realizado" | "a_realizar"; liquidacao: string | null; pista: string };

type EntradaParcela = {
  prefixo: "out" | "inc";
  tipo: "custo" | "receita";
  installmentId: number;
  billId: number;
  contraparte: string | null;
  documento: string | null;
  competencia: string | null;
  vencimento: string | null;
  isPrevisao: boolean;
  alocacoes: Alocacao[];
  fluxos: Corrente[];
  semApropriacaoOrcamento: boolean;
};

function montarLancamentos(e: EntradaParcela): { itens: LancamentoErp[]; avisos: string[] } {
  const avisos: string[] = [];
  const rotulo = `${e.prefixo === "out" ? "Parcela a pagar" : "Parcela a receber"} ${e.installmentId} (título ${e.billId})`;

  if (!e.competencia) {
    avisos.push(`${rotulo} ignorada: sem data de competência/emissão/vencimento.`);
    return { itens: [], avisos };
  }
  if (e.alocacoes.length === 0) {
    avisos.push(`${rotulo} ignorada: sem apropriação a centro de custo/obra.`);
    return { itens: [], avisos };
  }

  const itens: LancamentoErp[] = [];
  for (const fluxo of e.fluxos) {
    if (fluxo.valorCentavos === 0) continue;
    const partes = ratear(fluxo.valorCentavos, e.alocacoes.map((a) => a.peso));
    e.alocacoes.forEach((a, i) => {
      const valor = partes[i]!;
      if (valor === 0) return;
      itens.push({
        idOrigem: `${e.prefixo}:${e.installmentId}:${fluxo.chave}:${a.obraOrigemId}:${a.categoriaCodigo}`,
        grupoOrigem: `${e.prefixo}:${e.installmentId}`,
        obraOrigemId: a.obraOrigemId,
        tipo: e.tipo,
        situacao: fluxo.situacao,
        isPrevisao: fluxo.situacao === "a_realizar" && e.isPrevisao,
        valorCentavos: valor,
        dataCompetencia: e.competencia!,
        dataVencimento: e.vencimento,
        dataLiquidacao: fluxo.liquidacao,
        contraparte: e.contraparte,
        documento: e.documento,
        descricao: `${rotulo}${fluxo.situacao === "a_realizar" ? " — saldo em aberto" : " — baixa"}`,
        categoria: { codigo: a.categoriaCodigo, nome: a.categoriaNome },
        pistaClasse: `${a.categoriaNome} ${fluxo.pista}`,
        semApropriacaoOrcamento: e.semApropriacaoOrcamento,
      });
    });
  }
  return { itens, avisos };
}

const documentoDe = (id: string | null | undefined, numero: string | null | undefined) =>
  [texto(id), texto(numero)].filter(Boolean).join(" ") || null;

/**
 * Parcela do contas a pagar → lançamentos de custo:
 *  - cada baixa (pagamento) vira um lançamento REALIZADO (valor líquido ou bruto, conforme a opção);
 *  - o saldo em aberto vira um lançamento A REALIZAR, com o vencimento da parcela;
 *  - cada um é rateado entre centros de custo/planos financeiros pelos percentuais da apropriação
 *    (sem perder centavo);
 *  - título com documento de previsão marca o saldo como previsão;
 *  - parcela sem apropriação ao orçamento da obra é sinalizada (distorção).
 */
export function parcelaPagarParaLancamentos(p: ParcelaPagar, opcoes: OpcoesMapeamento = OPCOES_PADRAO) {
  const fluxos: Corrente[] = [];
  (p.payments ?? []).forEach((b, i) => {
    const bruto = opcoes.valorPagamento === "bruto";
    fluxos.push({
      chave: `p${b.sequencialNumber ?? i + 1}`,
      valorCentavos: paraCentavos(bruto ? b.grossAmount : b.netAmount),
      situacao: "realizado",
      liquidacao: dataISO(b.paymentDate) ?? dataISO(b.calculationDate),
      pista: texto(b.operationTypeName) ?? "",
    });
  });
  const saldo = paraCentavos(p.balanceAmount);
  if (saldo > 0) fluxos.push({ chave: "saldo", valorCentavos: saldo, situacao: "a_realizar", liquidacao: null, pista: "" });

  return montarLancamentos({
    prefixo: "out",
    tipo: "custo",
    installmentId: p.installmentId,
    billId: p.billId,
    contraparte: texto(p.creditorName),
    documento: documentoDe(p.documentIdentificationId, p.documentNumber),
    competencia: dataISO(p.billDate) ?? dataISO(p.issueDate) ?? dataISO(p.dueDate),
    vencimento: dataISO(p.dueDate),
    isPrevisao: texto(p.forecastDocument) !== null,
    alocacoes: alocacoesDe(p.paymentsCategories),
    fluxos,
    semApropriacaoOrcamento: (p.buildingsCosts ?? []).length === 0,
  });
}

const SIM = new Set(["S", "SIM", "Y", "YES", "TRUE", "1"]);

/** Parcela do contas a receber → lançamentos de receita (recibos realizados + saldo a receber). */
export function parcelaReceberParaLancamentos(p: ParcelaReceber, opcoes: OpcoesMapeamento = OPCOES_PADRAO) {
  const fluxos: Corrente[] = [];
  (p.receipts ?? []).forEach((r, i) => {
    const bruto = opcoes.valorPagamento === "bruto";
    fluxos.push({
      chave: `r${i + 1}-${texto(r.paymentDate)?.slice(0, 10) ?? "s"}`,
      valorCentavos: paraCentavos(bruto ? r.grossAmount : r.netAmount),
      situacao: "realizado",
      liquidacao: dataISO(r.paymentDate) ?? dataISO(r.calculationDate),
      pista: texto(r.operationTypeName) ?? "",
    });
  });
  const saldo = paraCentavos(p.balanceAmount);
  if (saldo > 0) fluxos.push({ chave: "saldo", valorCentavos: saldo, situacao: "a_realizar", liquidacao: null, pista: "" });

  return montarLancamentos({
    prefixo: "inc",
    tipo: "receita",
    installmentId: p.installmentId,
    billId: p.billId,
    contraparte: texto(p.clientName),
    documento: documentoDe(p.documentIdentificationId, p.documentNumber),
    competencia: dataISO(p.billDate) ?? dataISO(p.issueDate) ?? dataISO(p.dueDate),
    vencimento: dataISO(p.dueDate),
    isPrevisao: SIM.has((texto(p.documentForecast) ?? "").toUpperCase()),
    alocacoes: alocacoesDe(p.receiptsCategories),
    fluxos,
    // O contas a receber do Sienge não traz apropriação a orçamento de obra.
    semApropriacaoOrcamento: false,
  });
}

// ---------- Orçamento ----------

const GRUPO_POR_TIPO_DE_INSUMO: Record<string, CategoriaGrupo> = {
  MATERIAL: "material",
  MAINTENANCE_MATERIAL: "material",
  FUELS_AND_LUBRICANTS: "material",
  EQUIPMENT: "maquinas_equipamentos",
  LABOR: "mao_obra_direta",
  TRANSPORT_ITEM: "servicos",
  INCREMENTAL_COST_ITEM: "outros",
  OFFICE_SUPPLY: "outros",
  OTHER: "outros",
};

export const grupoDoInsumo = (categoria: string | null | undefined): CategoriaGrupo =>
  GRUPO_POR_TIPO_DE_INSUMO[(categoria ?? "").toUpperCase()] ?? "outros";

const primeiroNivel = (wbs: string | null | undefined) => (wbs ?? "").split(".")[0]!.trim();

/** Itens da versão mais recente do orçamento de cada obra. */
function versaoVigente(itens: ItemOrcamento[]): ItemOrcamento[] {
  const maxPorObra = new Map<number, number>();
  for (const i of itens) maxPorObra.set(i.buildingId, Math.max(maxPorObra.get(i.buildingId) ?? 0, i.versionNumber ?? 0));
  return itens.filter((i) => (i.versionNumber ?? 0) === maxPorObra.get(i.buildingId));
}

/**
 * Itens do orçamento do Sienge → linhas do orçamento do RGO: soma o valor dos itens-folha por
 * (etapa de primeiro nível da EDT × grupo de custo, conforme o tipo de insumo). Os agrupadores
 * (sem workItemId) só dão nome às etapas, para não contar duas vezes.
 */
export function orcamentoDosItens(itens: ItemOrcamento[]): OrcamentoErp[] {
  const resultado = new Map<string, OrcamentoErp>();
  const vigentes = versaoVigente(itens.filter((i) => !i["api-error"]));

  const nomesEtapa = new Map<string, string>();
  for (const i of vigentes) {
    const wbs = texto(i.wbsCode);
    if (i.workItemId === null || i.workItemId === undefined) {
      if (wbs && !wbs.includes(".")) nomesEtapa.set(`${i.buildingId}|${wbs}`, texto(i.description) ?? wbs);
    }
  }

  for (const i of vigentes) {
    if (i.workItemId === null || i.workItemId === undefined) continue; // agrupador
    const etapa = primeiroNivel(i.wbsCode);
    const porTipo = (i.pricesByCategory ?? []).filter((p) => paraCentavos(p.totalPrice) !== 0);
    const partes = porTipo.length > 0 ? porTipo.map((p) => ({ grupo: grupoDoInsumo(p.category), centavos: paraCentavos(p.totalPrice) })) : [{ grupo: "outros" as CategoriaGrupo, centavos: paraCentavos(i.totalPrice) }];

    for (const parte of partes) {
      if (parte.centavos === 0) continue;
      const versao = i.versionNumber ?? 1;
      const idOrigem = `bud:${i.buildingId}:v${versao}:${etapa || "-"}:${parte.grupo}`;
      const atual = resultado.get(idOrigem);
      if (atual) atual.valorCentavos += parte.centavos;
      else
        resultado.set(idOrigem, {
          idOrigem,
          obraOrigemId: String(i.buildingId),
          versao,
          etapa: etapa ? { codigo: etapa, nome: nomesEtapa.get(`${i.buildingId}|${etapa}`) ?? null } : null,
          grupo: parte.grupo,
          valorCentavos: parte.centavos,
          descricao: etapa ? (nomesEtapa.get(`${i.buildingId}|${etapa}`) ?? null) : null,
        });
    }
  }
  return [...resultado.values()].sort((a, b) => a.idOrigem.localeCompare(b.idOrigem));
}

// ---------- Avanço físico ----------

export type EscalaPercentual = "0-100" | "0-1";

/**
 * % de execução da obra numa data de referência, ponderado pelo valor orçado dos itens-folha:
 * Σ(valor × %) / Σ(valor de TODOS os itens-folha). Item sem ligação com o planejamento conta como 0%.
 * Devolve frações (0–1) ou null se não houver orçamento.
 */
export function avancoDaObra(itens: ItemOrcamento[], escala: EscalaPercentual = "0-100"): { planejado: number; realizado: number } | null {
  const folhas = versaoVigente(itens.filter((i) => !i["api-error"])).filter((i) => i.workItemId !== null && i.workItemId !== undefined);
  const total = folhas.reduce((s, i) => s + Math.max(0, i.totalPrice ?? 0), 0);
  if (total <= 0) return null;

  const divisor = escala === "0-100" ? 100 : 1;
  const ponderado = (campo: "scheduledPercentComplete" | "percentComplete") =>
    Math.min(1, Math.max(0, folhas.reduce((s, i) => s + Math.max(0, i.totalPrice ?? 0) * ((i[campo] ?? 0) / divisor), 0) / total));
  return { planejado: ponderado("scheduledPercentComplete"), realizado: ponderado("percentComplete") };
}

/**
 * Série mensal a partir dos acumulados lidos em cada fim de mês: o "no mês" é a diferença para o
 * mês anterior (nunca negativo). O planejamento do Sienge entra como versão 1 (a 0 fica para a
 * linha de base importada por planilha).
 */
export function serieDeAvanco(obraOrigemId: string, acumulados: { competencia: string; planejado: number; realizado: number }[]): AvancoErp[] {
  const ordenados = [...acumulados].sort((a, b) => a.competencia.localeCompare(b.competencia));
  const bps = (f: number) => Math.round(f * 10_000);
  const resultado: AvancoErp[] = [];
  let anteriorPlan = 0;
  let anteriorReal = 0;
  for (const a of ordenados) {
    resultado.push(
      { obraOrigemId, competencia: a.competencia, tipo: "planejado", versao: 1, pctAcumBps: bps(a.planejado), pctMesBps: Math.max(0, bps(a.planejado) - bps(anteriorPlan)) },
      { obraOrigemId, competencia: a.competencia, tipo: "realizado", versao: 0, pctAcumBps: bps(a.realizado), pctMesBps: Math.max(0, bps(a.realizado) - bps(anteriorReal)) },
    );
    anteriorPlan = a.planejado;
    anteriorReal = a.realizado;
  }
  return resultado;
}
