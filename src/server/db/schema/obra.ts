import {
  char,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_helpers";
import { organization, user } from "./auth";
import { obraStatus } from "./enums";

export const obra = pgTable(
  "obra",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: text("empresa_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    codigo: text("codigo").notNull(),
    nome: text("nome").notNull(),
    status: obraStatus("status").notNull().default("planejada"),
    dataInicio: date("data_inicio", { mode: "string" }),
    dataFimPrevista: date("data_fim_prevista", { mode: "string" }),
    cidade: text("cidade"),
    uf: char("uf", { length: 2 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("obra_empresa_codigo_uidx").on(t.empresaId, t.codigo),
    index("obra_empresa_idx").on(t.empresaId),
    // Alvo das chaves estrangeiras compostas das tabelas filhas: garante o mesmo empresa_id.
    unique("obra_id_empresa_uq").on(t.id, t.empresaId),
  ],
);

/** Obras liberadas a um usuário com papel "cliente". */
export const obraAcesso = pgTable(
  "obra_acesso",
  {
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    obraId: uuid("obra_id").notNull(),
    empresaId: text("empresa_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.usuarioId, t.obraId] }),
    foreignKey({
      columns: [t.obraId, t.empresaId],
      foreignColumns: [obra.id, obra.empresaId],
      name: "obra_acesso_obra_empresa_fk",
    }).onDelete("cascade"),
    index("obra_acesso_obra_idx").on(t.obraId),
  ],
);
