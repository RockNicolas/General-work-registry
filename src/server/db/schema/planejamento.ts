import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamps } from "./_helpers";
import { organization } from "./auth";
import { avancoTipo, categoriaGrupo, origem } from "./enums";
import { obra } from "./obra";

/** Classificação de custos/receitas, por empresa. `grupo` alimenta os indicadores por tipo de custo. */
export const categoria = pgTable(
  "categoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: text("empresa_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    grupo: categoriaGrupo("grupo").notNull().default("outros"),
    /** Código da categoria no ERP, para mapear na sincronização. */
    codigoOrigem: text("codigo_origem"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("categoria_empresa_nome_uidx").on(t.empresaId, t.nome),
    unique("categoria_id_empresa_uq").on(t.id, t.empresaId),
  ],
);

/** Centro de custo / etapa da obra (hierárquico via pai_id). */
export const etapa = pgTable(
  "etapa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: text("empresa_id").notNull(),
    obraId: uuid("obra_id").notNull(),
    paiId: uuid("pai_id"),
    codigo: text("codigo").notNull(),
    nome: text("nome").notNull(),
    ordem: integer("ordem").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.obraId, t.empresaId],
      foreignColumns: [obra.id, obra.empresaId],
      name: "etapa_obra_empresa_fk",
    }).onDelete("cascade"),
    // A etapa-pai precisa ser da mesma obra.
    foreignKey({
      columns: [t.paiId, t.obraId],
      foreignColumns: [t.id, t.obraId],
      name: "etapa_pai_fk",
    }),
    uniqueIndex("etapa_obra_codigo_uidx").on(t.obraId, t.codigo),
    unique("etapa_id_obra_uq").on(t.id, t.obraId),
    index("etapa_obra_idx").on(t.obraId),
  ],
);

/** Orçamento (previsto) por obra, opcionalmente por etapa/categoria. */
export const orcamento = pgTable(
  "orcamento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: text("empresa_id").notNull(),
    obraId: uuid("obra_id").notNull(),
    etapaId: uuid("etapa_id"),
    categoriaId: uuid("categoria_id"),
    versao: integer("versao").notNull().default(1),
    vigente: boolean("vigente").notNull().default(true),
    descricao: text("descricao"),
    valorPrevistoCentavos: bigint("valor_previsto_centavos", { mode: "number" }).notNull(),
    origem: origem("origem").notNull().default("manual"),
    idOrigem: text("id_origem"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.obraId, t.empresaId],
      foreignColumns: [obra.id, obra.empresaId],
      name: "orcamento_obra_empresa_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.etapaId, t.obraId],
      foreignColumns: [etapa.id, etapa.obraId],
      name: "orcamento_etapa_fk",
    }),
    foreignKey({
      columns: [t.categoriaId, t.empresaId],
      foreignColumns: [categoria.id, categoria.empresaId],
      name: "orcamento_categoria_fk",
    }),
    check("orcamento_valor_nao_negativo", sql`${t.valorPrevistoCentavos} >= 0`),
    index("orcamento_obra_idx").on(t.obraId, t.vigente),
    // Reimportar o mesmo item do ERP/planilha atualiza em vez de duplicar.
    uniqueIndex("orcamento_origem_uidx")
      .on(t.empresaId, t.origem, t.idOrigem)
      .where(sql`${t.idOrigem} is not null`),
  ],
);

/**
 * Avanço físico mensal (% da obra), planejado × realizado. `versao` 0 é a linha de base do
 * planejamento; revisões posteriores usam versões maiores.
 */
export const avancoFisico = pgTable(
  "avanco_fisico",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: text("empresa_id").notNull(),
    obraId: uuid("obra_id").notNull(),
    /** Primeiro dia do mês de competência. */
    competencia: date("competencia", { mode: "string" }).notNull(),
    tipo: avancoTipo("tipo").notNull(),
    versao: smallint("versao").notNull().default(0),
    /** Percentuais em pontos-base (10000 = 100%). */
    pctMesBps: integer("pct_mes_bps").notNull().default(0),
    pctAcumBps: integer("pct_acum_bps").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.obraId, t.empresaId],
      foreignColumns: [obra.id, obra.empresaId],
      name: "avanco_obra_empresa_fk",
    }).onDelete("cascade"),
    uniqueIndex("avanco_unico_uidx").on(t.obraId, t.tipo, t.versao, t.competencia),
    check("avanco_pct_mes_faixa", sql`${t.pctMesBps} between 0 and 10000`),
    check("avanco_pct_acum_faixa", sql`${t.pctAcumBps} between 0 and 10000`),
    check("avanco_competencia_dia_1", sql`extract(day from ${t.competencia}) = 1`),
  ],
);
