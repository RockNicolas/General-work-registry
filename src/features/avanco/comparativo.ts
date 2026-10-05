import type { AvancoTipo } from "@/lib/domain";

export type AvancoLinha = {
  competencia: string; // "YYYY-MM-01"
  tipo: AvancoTipo;
  versao: number;
  pctMesBps: number;
  pctAcumBps: number;
};

export type ComparativoMes = {
  competencia: string;
  planejadoMesBps: number | null;
  planejadoAcumBps: number | null;
  realizadoMesBps: number | null;
  realizadoAcumBps: number | null;
  /** Realizado − planejado, acumulados, em pontos-base. Negativo = atraso. null se faltar um dos lados. */
  desvioAcumBps: number | null;
};

/** A linha de base do planejamento: a MENOR versão planejada existente (planilha usa 0; o Sienge, 1). */
export function versaoBase(linhas: AvancoLinha[]): number | null {
  let menor: number | null = null;
  for (const l of linhas) if (l.tipo === "planejado" && (menor === null || l.versao < menor)) menor = l.versao;
  return menor;
}

/**
 * Junta planejado e realizado por mês. O planejado vem da `versaoPlanejada`; sem ela, da linha de
 * base (a menor versão planejada existente). O realizado não tem versão relevante: vale o mais
 * recente lançado para o mês.
 */
export function compararAvanco(linhas: AvancoLinha[], versaoPlanejada?: number): ComparativoMes[] {
  const versaoPlan = versaoPlanejada ?? versaoBase(linhas);
  const meses = new Map<string, ComparativoMes>();
  const ensure = (competencia: string): ComparativoMes => {
    let m = meses.get(competencia);
    if (!m) {
      m = {
        competencia,
        planejadoMesBps: null,
        planejadoAcumBps: null,
        realizadoMesBps: null,
        realizadoAcumBps: null,
        desvioAcumBps: null,
      };
      meses.set(competencia, m);
    }
    return m;
  };

  const versaoRealizado = new Map<string, number>();
  for (const l of linhas) {
    const m = ensure(l.competencia);
    if (l.tipo === "planejado" && l.versao === versaoPlan) {
      m.planejadoMesBps = l.pctMesBps;
      m.planejadoAcumBps = l.pctAcumBps;
    }
    if (l.tipo === "realizado" && l.versao >= (versaoRealizado.get(l.competencia) ?? -1)) {
      versaoRealizado.set(l.competencia, l.versao);
      m.realizadoMesBps = l.pctMesBps;
      m.realizadoAcumBps = l.pctAcumBps;
    }
  }

  return [...meses.values()]
    .map((m) => ({
      ...m,
      desvioAcumBps:
        m.planejadoAcumBps !== null && m.realizadoAcumBps !== null ? m.realizadoAcumBps - m.planejadoAcumBps : null,
    }))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));
}
