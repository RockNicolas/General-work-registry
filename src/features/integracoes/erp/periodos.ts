import type { Janela } from "./tipos";

/** "2026-03" + n meses → "2026-02" etc. */
export function somaMeses(anoMes: string, n: number): string {
  const [a, m] = anoMes.split("-").map(Number) as [number, number];
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function ultimoDiaDoMes(anoMes: string): string {
  const [a, m] = anoMes.split("-").map(Number) as [number, number];
  return `${anoMes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Divide uma janela em meses inteiros (primeiro e último dia de cada mês, cortados pela janela). */
export function dividirEmMeses(janela: Janela): Janela[] {
  const meses: Janela[] = [];
  let mes = janela.inicio.slice(0, 7);
  const ultimo = janela.fim.slice(0, 7);
  while (mes <= ultimo) {
    const inicio = mes === janela.inicio.slice(0, 7) ? janela.inicio : `${mes}-01`;
    const fim = mes === ultimo ? janela.fim : ultimoDiaDoMes(mes);
    meses.push({ inicio, fim });
    mes = somaMeses(mes, 1);
  }
  return meses;
}

/** Lista "YYYY-MM" de `de` até `ate`, inclusive. */
export function listarMeses(de: string, ate: string): string[] {
  const resultado: string[] = [];
  for (let m = de; m <= ate; m = somaMeses(m, 1)) resultado.push(m);
  return resultado;
}

export function hojeISO(agora: Date = new Date()): string {
  return agora.toISOString().slice(0, 10);
}

export type TipoJanela = "historica" | "incremental";

/**
 * Janela de uma sincronização, por competência:
 * - incremental: últimos `mesesReprocessar` meses (o que ainda muda: pagamentos, novas parcelas)
 *   até `mesesFuturos` à frente (contas a pagar/receber projetadas);
 * - histórica: desde `mesesHistorico` meses atrás.
 */
export function janelaDaSincronizacao(
  tipo: TipoJanela,
  cfg: { mesesHistorico: number; mesesReprocessar: number; mesesFuturos: number },
  hoje: string = hojeISO(),
): Janela {
  const mesAtual = hoje.slice(0, 7);
  const atras = tipo === "historica" ? cfg.mesesHistorico : cfg.mesesReprocessar;
  return { inicio: `${somaMeses(mesAtual, -atras)}-01`, fim: ultimoDiaDoMes(somaMeses(mesAtual, cfg.mesesFuturos)) };
}
