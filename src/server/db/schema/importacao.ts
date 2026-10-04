import { foreignKey, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_helpers";
import { organization, user } from "./auth";
import { importacaoStatus } from "./enums";

/** Um arquivo importado (.xlsx/.csv no modelo padrão). */
export const importacao = pgTable(
  "importacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: text("empresa_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    usuarioId: text("usuario_id").references(() => user.id, { onDelete: "set null" }),
    arquivoNome: text("arquivo_nome").notNull(),
    /** sha256 do conteúdo: avisa quando o mesmo arquivo é enviado de novo. */
    arquivoHash: text("arquivo_hash").notNull(),
    status: importacaoStatus("status").notNull().default("previa"),
    total: integer("total").notNull().default(0),
    ok: integer("ok").notNull().default(0),
    comErro: integer("com_erro").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique("importacao_id_empresa_uq").on(t.id, t.empresaId),
    index("importacao_empresa_idx").on(t.empresaId, t.createdAt),
  ],
);

/** Erros por linha da planilha (mostrados na prévia e no histórico). */
export const importacaoErro = pgTable(
  "importacao_erro",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: text("empresa_id").notNull(),
    importacaoId: uuid("importacao_id").notNull(),
    aba: text("aba"),
    linha: integer("linha").notNull(),
    coluna: text("coluna"),
    valor: text("valor"),
    mensagem: text("mensagem").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.importacaoId, t.empresaId],
      foreignColumns: [importacao.id, importacao.empresaId],
      name: "importacao_erro_importacao_fk",
    }).onDelete("cascade"),
    index("importacao_erro_importacao_idx").on(t.importacaoId),
  ],
);
