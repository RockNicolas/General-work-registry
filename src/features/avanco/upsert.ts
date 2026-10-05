import { sql } from "drizzle-orm";
import { CONTAGEM_ZERO, type ContagemConjunto, type Executor, somarContagens } from "@/features/lancamentos/upsert";

export type AvancoUpsert = {
  obraId: string;
  /** Primeiro dia do mês. */
  competencia: string;
  tipo: "planejado" | "realizado";
  versao: number;
  pctMesBps: number;
  pctAcumBps: number;
};

const TAMANHO_LOTE = 300;

/** Grava avanço físico: a chave natural é (obra, tipo, versão, mês); reenviar atualiza só se mudou. */
export async function upsertAvanco(tx: Executor, empresaId: string, itens: AvancoUpsert[]): Promise<ContagemConjunto> {
  let total = CONTAGEM_ZERO;
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
    const lote = itens.slice(i, i + TAMANHO_LOTE);
    const valores = sql.join(
      lote.map(
        (a) => sql`(${empresaId}, ${a.obraId}::uuid, ${a.competencia}::date, ${a.tipo}::avanco_tipo, ${a.versao}::smallint,
          ${a.pctMesBps}::int, ${a.pctAcumBps}::int)`,
      ),
      sql`, `,
    );
    const r = await tx.execute(sql`
      insert into avanco_fisico (empresa_id, obra_id, competencia, tipo, versao, pct_mes_bps, pct_acum_bps)
      values ${valores}
      on conflict (obra_id, tipo, versao, competencia)
      do update set pct_mes_bps = excluded.pct_mes_bps, pct_acum_bps = excluded.pct_acum_bps, updated_at = now()
      where (avanco_fisico.pct_mes_bps, avanco_fisico.pct_acum_bps) is distinct from (excluded.pct_mes_bps, excluded.pct_acum_bps)
      returning (xmax = 0) as inserido`);
    const retornadas = r.rows as { inserido: boolean }[];
    const inseridos = retornadas.filter((x) => x.inserido).length;
    total = somarContagens(total, { inseridos, atualizados: retornadas.length - inseridos, inalterados: lote.length - retornadas.length });
  }
  return total;
}
