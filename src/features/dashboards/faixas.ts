/**
 * Faixas de vencimento das contas a pagar/receber (do processo financeiro do Sienge: 30/45/60/90/120
 * dias, com e sem título de previsão). `limite` é o último dia (contado a partir de hoje) que pertence
 * à faixa; "vencidas" são as de vencimento anterior a hoje.
 */
export const FAIXAS_VENCIMENTO = [
  { id: "vencidas", rotulo: "Vencidas", curto: "Vencidas", limite: -1 },
  { id: "ate30", rotulo: "Até 30 dias", curto: "0–30", limite: 30 },
  { id: "ate45", rotulo: "31 a 45 dias", curto: "31–45", limite: 45 },
  { id: "ate60", rotulo: "46 a 60 dias", curto: "46–60", limite: 60 },
  { id: "ate90", rotulo: "61 a 90 dias", curto: "61–90", limite: 90 },
  { id: "ate120", rotulo: "91 a 120 dias", curto: "91–120", limite: 120 },
  { id: "mais120", rotulo: "Acima de 120 dias", curto: ">120", limite: Number.POSITIVE_INFINITY },
] as const;

export type FaixaId = (typeof FAIXAS_VENCIMENTO)[number]["id"];

/** Em qual faixa cai um vencimento a `dias` de hoje (negativo = já venceu; 0 = vence hoje). */
export function faixaDe(dias: number): FaixaId {
  return FAIXAS_VENCIMENTO.find((f) => dias <= f.limite)?.id ?? "mais120";
}

export type LinhaFaixa = {
  faixa: FaixaId;
  rotulo: string;
  /** Rótulo curto para o eixo do gráfico (dias a partir de hoje). */
  curto: string;
  /** Títulos de previsão (sem nota fiscal), em centavos. */
  previsao: number;
  /** Títulos efetivos, em centavos. */
  efetivo: number;
};

export type Vencimentos = {
  faixas: LinhaFaixa[];
  /** A realizar sem data de vencimento informada (não entram nas faixas). */
  semVencimento: number;
};

/** Distribui os valores por faixa, já com todas as faixas presentes (mesmo as zeradas). */
export function agruparPorFaixa(itens: { dias: number | null; isPrevisao: boolean; valor: number }[]): Vencimentos {
  const faixas: LinhaFaixa[] = FAIXAS_VENCIMENTO.map((f) => ({ faixa: f.id, rotulo: f.rotulo, curto: f.curto, previsao: 0, efetivo: 0 }));
  let semVencimento = 0;
  for (const item of itens) {
    if (item.dias === null) {
      semVencimento += item.valor;
      continue;
    }
    const linha = faixas.find((f) => f.faixa === faixaDe(item.dias!))!;
    if (item.isPrevisao) linha.previsao += item.valor;
    else linha.efetivo += item.valor;
  }
  return { faixas, semVencimento };
}
