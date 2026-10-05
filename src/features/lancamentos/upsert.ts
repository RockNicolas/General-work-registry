import { sql } from "drizzle-orm";
import type { LancamentoClasse, LancamentoSituacao, LancamentoTipo } from "@/lib/domain";
import type { Database } from "@/server/db/scope";

/** Qualquer coisa que executa SQL: a conexão ou uma transação (withScope ou transaction()). */
export type Executor = Pick<Database, "execute">;

export type ContagemConjunto = { inseridos: number; atualizados: number; inalterados: number };
export const CONTAGEM_ZERO: ContagemConjunto = { inseridos: 0, atualizados: 0, inalterados: 0 };

export const somarContagens = (a: ContagemConjunto, b: ContagemConjunto): ContagemConjunto => ({
  inseridos: a.inseridos + b.inseridos,
  atualizados: a.atualizados + b.atualizados,
  inalterados: a.inalterados + b.inalterados,
});

export type LancamentoUpsert = {
  obraId: string;
  etapaId: string | null;
  categoriaId: string;
  tipo: LancamentoTipo;
  situacao: LancamentoSituacao;
  classe: LancamentoClasse;
  isPrevisao: boolean;
  valorCentavos: number;
  dataCompetencia: string;
  dataVencimento: string | null;
  dataLiquidacao: string | null;
  contraparte: string | null;
  documento: string | null;
  descricao: string | null;
  idOrigem: string;
};

export type DestinoUpsert = {
  empresaId: string;
  origem: "planilha" | "erp";
  /** Preenchido nas linhas vindas de ERP; faz parte da chave de idempotência. */
  integracaoId: string | null;
  importacaoId: string | null;
};

const TAMANHO_LOTE = 300;

function emLotes<T>(itens: T[], n: number): T[][] {
  return Array.from({ length: Math.ceil(itens.length / n) }, (_, i) => itens.slice(i * n, i * n + n));
}

/**
 * Grava lançamentos de forma idempotente: a chave é (empresa, origem, integração, id_origem).
 * Linha nova é inserida; linha existente é atualizada SÓ se algum campo mudou (senão fica
 * "inalterada"). Devolve as contagens, por meio de `xmax = 0` (inserção) e do filtro
 * `IS DISTINCT FROM` (atualização real).
 */
export async function upsertLancamentos(tx: Executor, destino: DestinoUpsert, itens: LancamentoUpsert[]): Promise<ContagemConjunto> {
  let total = CONTAGEM_ZERO;
  for (const lote of emLotes(itens, TAMANHO_LOTE)) {
    const valores = sql.join(
      lote.map(
        (l) => sql`(${destino.empresaId}, ${l.obraId}::uuid, ${l.etapaId}::uuid, ${l.categoriaId}::uuid, ${l.tipo}::lancamento_tipo,
          ${l.situacao}::lancamento_situacao, ${l.classe}::lancamento_classe, ${l.isPrevisao}::boolean, ${l.valorCentavos}::bigint,
          ${l.dataCompetencia}::date, ${l.dataVencimento}::date, ${l.dataLiquidacao}::date, ${l.contraparte}::text,
          ${l.documento}::text, ${l.descricao}::text, ${destino.origem}::origem, ${destino.integracaoId}::uuid,
          ${destino.importacaoId}::uuid, ${l.idOrigem}::text)`,
      ),
      sql`, `,
    );
    const r = await tx.execute(sql`
      insert into lancamento
        (empresa_id, obra_id, etapa_id, categoria_id, tipo, situacao, classe, is_previsao, valor_centavos,
         data_competencia, data_vencimento, data_liquidacao, contraparte, documento, descricao, origem,
         integracao_id, importacao_id, id_origem)
      values ${valores}
      on conflict (empresa_id, origem, (coalesce(integracao_id, '00000000-0000-0000-0000-000000000000'::uuid)), id_origem)
        where id_origem is not null
      do update set
        obra_id = excluded.obra_id, etapa_id = excluded.etapa_id, categoria_id = excluded.categoria_id,
        tipo = excluded.tipo, situacao = excluded.situacao, classe = excluded.classe, is_previsao = excluded.is_previsao,
        valor_centavos = excluded.valor_centavos, data_competencia = excluded.data_competencia,
        data_vencimento = excluded.data_vencimento, data_liquidacao = excluded.data_liquidacao,
        contraparte = excluded.contraparte, documento = excluded.documento, descricao = excluded.descricao,
        importacao_id = excluded.importacao_id, updated_at = now()
      where (lancamento.obra_id, lancamento.etapa_id, lancamento.categoria_id, lancamento.tipo, lancamento.situacao,
             lancamento.classe, lancamento.is_previsao, lancamento.valor_centavos, lancamento.data_competencia,
             lancamento.data_vencimento, lancamento.data_liquidacao, lancamento.contraparte, lancamento.documento,
             lancamento.descricao)
        is distinct from
            (excluded.obra_id, excluded.etapa_id, excluded.categoria_id, excluded.tipo, excluded.situacao,
             excluded.classe, excluded.is_previsao, excluded.valor_centavos, excluded.data_competencia,
             excluded.data_vencimento, excluded.data_liquidacao, excluded.contraparte, excluded.documento,
             excluded.descricao)
      returning (xmax = 0) as inserido`);

    const retornadas = r.rows as { inserido: boolean }[];
    const inseridos = retornadas.filter((x) => x.inserido).length;
    total = somarContagens(total, {
      inseridos,
      atualizados: retornadas.length - inseridos,
      inalterados: lote.length - retornadas.length,
    });
  }
  return total;
}
