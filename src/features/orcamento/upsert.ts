import { sql } from "drizzle-orm";
import { CONTAGEM_ZERO, type ContagemConjunto, type Executor, somarContagens } from "@/features/lancamentos/upsert";

export type OrcamentoUpsert = {
  obraId: string;
  etapaId: string | null;
  categoriaId: string | null;
  versao: number;
  descricao: string | null;
  valorPrevistoCentavos: number;
  /** Único por empresa+origem. Importação: "x:<id>"/"h:<hash>"; ERP: "<integração>:bud:...". */
  idOrigem: string;
};

const TAMANHO_LOTE = 300;

/**
 * Grava itens de orçamento de forma idempotente (chave: empresa, origem, id_origem). Atualiza só o
 * que mudou e devolve inseridos/atualizados/inalterados.
 */
export async function upsertOrcamento(
  tx: Executor,
  destino: { empresaId: string; origem: "planilha" | "erp" },
  itens: OrcamentoUpsert[],
): Promise<ContagemConjunto> {
  let total = CONTAGEM_ZERO;
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
    const lote = itens.slice(i, i + TAMANHO_LOTE);
    const valores = sql.join(
      lote.map(
        (o) => sql`(${destino.empresaId}, ${o.obraId}::uuid, ${o.etapaId}::uuid, ${o.categoriaId}::uuid, ${o.versao}::int, true,
          ${o.descricao}::text, ${o.valorPrevistoCentavos}::bigint, ${destino.origem}::origem, ${o.idOrigem}::text)`,
      ),
      sql`, `,
    );
    const r = await tx.execute(sql`
      insert into orcamento
        (empresa_id, obra_id, etapa_id, categoria_id, versao, vigente, descricao, valor_previsto_centavos, origem, id_origem)
      values ${valores}
      on conflict (empresa_id, origem, id_origem) where id_origem is not null
      do update set
        obra_id = excluded.obra_id, etapa_id = excluded.etapa_id, categoria_id = excluded.categoria_id,
        versao = excluded.versao, descricao = excluded.descricao,
        valor_previsto_centavos = excluded.valor_previsto_centavos, updated_at = now()
      where (orcamento.obra_id, orcamento.etapa_id, orcamento.categoria_id, orcamento.versao, orcamento.descricao,
             orcamento.valor_previsto_centavos)
        is distinct from
            (excluded.obra_id, excluded.etapa_id, excluded.categoria_id, excluded.versao, excluded.descricao,
             excluded.valor_previsto_centavos)
      returning (xmax = 0) as inserido`);
    const retornadas = r.rows as { inserido: boolean }[];
    const inseridos = retornadas.filter((x) => x.inserido).length;
    total = somarContagens(total, { inseridos, atualizados: retornadas.length - inseridos, inalterados: lote.length - retornadas.length });
  }
  return total;
}
