import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_helpers";
import { organization } from "./auth";
import { erp, integracaoStatus, syncGatilho, syncStatus } from "./enums";
import { obra } from "./obra";

/** Conexão de uma empresa com um ERP. Credenciais sempre criptografadas (AES-256-GCM). */
export const integracao = pgTable(
  "integracao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: text("empresa_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    erp: erp("erp").notNull(),
    nome: text("nome").notNull(),
    /** Subdomínio (Sienge) ou URL base (UAU). */
    endereco: text("endereco").notNull(),
    /** JSON {usuario, senha} criptografado: "v1.iv.tag.ciphertext" em base64url. */
    credenciaisEnc: text("credenciais_enc"),
    chaveVersao: smallint("chave_versao").notNull().default(1),
    /** Hash (sha256) do segredo do webhook; o segredo em si só é mostrado uma vez. */
    webhookSecretHash: text("webhook_secret_hash"),
    status: integracaoStatus("status").notNull().default("pausada"),
    ultimaSyncEm: timestamp("ultima_sync_em", { withTimezone: true }),
    ultimoErro: text("ultimo_erro"),
    /** Expressão cron (UTC) da sincronização agendada; nulo = só manual. */
    agendamentoCron: text("agendamento_cron"),
    config: jsonb("config").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("integracao_empresa_nome_uidx").on(t.empresaId, t.nome),
    unique("integracao_id_empresa_uq").on(t.id, t.empresaId),
  ],
);

/** Mapa obra do ERP ↔ obra do RGO. */
export const integracaoObra = pgTable(
  "integracao_obra",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: text("empresa_id").notNull(),
    integracaoId: uuid("integracao_id").notNull(),
    obraId: uuid("obra_id").notNull(),
    idOrigem: text("id_origem").notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.integracaoId, t.empresaId],
      foreignColumns: [integracao.id, integracao.empresaId],
      name: "integracao_obra_integracao_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.obraId, t.empresaId],
      foreignColumns: [obra.id, obra.empresaId],
      name: "integracao_obra_obra_fk",
    }).onDelete("cascade"),
    uniqueIndex("integracao_obra_origem_uidx").on(t.integracaoId, t.idOrigem),
    uniqueIndex("integracao_obra_obra_uidx").on(t.integracaoId, t.obraId),
  ],
);

/** Uma execução de sincronização, com contadores e log. */
export const sincronizacao = pgTable(
  "sincronizacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: text("empresa_id").notNull(),
    integracaoId: uuid("integracao_id").notNull(),
    gatilho: syncGatilho("gatilho").notNull(),
    status: syncStatus("status").notNull().default("enfileirada"),
    escopo: jsonb("escopo").notNull().default({}),
    iniciadaEm: timestamp("iniciada_em", { withTimezone: true }),
    finalizadaEm: timestamp("finalizada_em", { withTimezone: true }),
    lidos: integer("lidos").notNull().default(0),
    gravados: integer("gravados").notNull().default(0),
    ignorados: integer("ignorados").notNull().default(0),
    erros: integer("erros").notNull().default(0),
    log: jsonb("log").notNull().default([]),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.integracaoId, t.empresaId],
      foreignColumns: [integracao.id, integracao.empresaId],
      name: "sincronizacao_integracao_fk",
    }).onDelete("cascade"),
    index("sincronizacao_integracao_idx").on(t.integracaoId, t.createdAt),
  ],
);
