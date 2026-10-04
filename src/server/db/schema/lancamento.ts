import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_helpers";
import { lancamentoClasse, lancamentoSituacao, lancamentoTipo, origem } from "./enums";
import { importacao } from "./importacao";
import { integracao } from "./integracao";
import { obra } from "./obra";
import { categoria, etapa } from "./planejamento";

/**
 * Fato financeiro: custo ou receita de uma obra.
 * - situacao: realizado = pago/recebido (incorrido); a_realizar = em aberto.
 *   Comprometido = realizado + a_realizar (custos).
 * - classe: só "operacional" entra na margem; aporte/adiantamento/devolução são movimentos de caixa.
 * - Idempotência: (empresa, origem, integração, id_origem) é único; reimportar/ressincronizar
 *   atualiza a linha existente.
 */
export const lancamento = pgTable(
  "lancamento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: text("empresa_id").notNull(),
    obraId: uuid("obra_id").notNull(),
    etapaId: uuid("etapa_id"),
    categoriaId: uuid("categoria_id").notNull(),
    tipo: lancamentoTipo("tipo").notNull(),
    situacao: lancamentoSituacao("situacao").notNull().default("realizado"),
    classe: lancamentoClasse("classe").notNull().default("operacional"),
    /** Título de previsão (sem nota fiscal), para separar nas faixas de contas a pagar. */
    isPrevisao: boolean("is_previsao").notNull().default(false),
    /** Centavos; negativo é estorno. Nunca float. */
    valorCentavos: bigint("valor_centavos", { mode: "number" }).notNull(),
    dataCompetencia: date("data_competencia", { mode: "string" }).notNull(),
    dataVencimento: date("data_vencimento", { mode: "string" }),
    dataLiquidacao: date("data_liquidacao", { mode: "string" }),
    contraparte: text("contraparte"),
    documento: text("documento"),
    descricao: text("descricao"),
    origem: origem("origem").notNull().default("manual"),
    integracaoId: uuid("integracao_id"),
    importacaoId: uuid("importacao_id"),
    idOrigem: text("id_origem"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.obraId, t.empresaId],
      foreignColumns: [obra.id, obra.empresaId],
      name: "lancamento_obra_empresa_fk",
    }),
    foreignKey({
      columns: [t.etapaId, t.obraId],
      foreignColumns: [etapa.id, etapa.obraId],
      name: "lancamento_etapa_fk",
    }),
    foreignKey({
      columns: [t.categoriaId, t.empresaId],
      foreignColumns: [categoria.id, categoria.empresaId],
      name: "lancamento_categoria_fk",
    }),
    foreignKey({
      columns: [t.integracaoId, t.empresaId],
      foreignColumns: [integracao.id, integracao.empresaId],
      name: "lancamento_integracao_fk",
    }),
    foreignKey({
      columns: [t.importacaoId, t.empresaId],
      foreignColumns: [importacao.id, importacao.empresaId],
      name: "lancamento_importacao_fk",
    }),
    check("lancamento_valor_nao_zero", sql`${t.valorCentavos} <> 0`),
    index("lancamento_obra_data_idx").on(t.empresaId, t.obraId, t.dataCompetencia),
    index("lancamento_obra_situacao_venc_idx").on(t.obraId, t.situacao, t.dataVencimento),
    index("lancamento_importacao_idx").on(t.importacaoId),
    uniqueIndex("lancamento_origem_uidx")
      .on(
        t.empresaId,
        t.origem,
        sql`coalesce(${t.integracaoId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        t.idOrigem,
      )
      .where(sql`${t.idOrigem} is not null`),
  ],
);
