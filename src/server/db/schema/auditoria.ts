import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Quem alterou o quê e quando. Append-only (o papel do app só tem INSERT/SELECT).
 * Sem FKs de propósito: o registro precisa sobreviver à exclusão de usuários/empresas.
 */
export const auditoria = pgTable(
  "auditoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: text("empresa_id"),
    usuarioId: text("usuario_id"),
    usuarioNome: text("usuario_nome"),
    acao: text("acao").notNull(),
    entidade: text("entidade").notNull(),
    entidadeId: text("entidade_id"),
    resumo: text("resumo"),
    antes: jsonb("antes"),
    depois: jsonb("depois"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("auditoria_criado_idx").on(t.criadoEm),
    index("auditoria_entidade_idx").on(t.entidade, t.entidadeId),
    index("auditoria_empresa_idx").on(t.empresaId, t.criadoEm),
  ],
);
