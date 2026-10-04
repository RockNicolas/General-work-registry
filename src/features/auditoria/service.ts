import { desc } from "drizzle-orm";
import type { AppContext } from "@/features/auth/context";
import { auditoria } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";

export type AuditoriaRow = {
  id: string;
  criadoEm: string;
  usuarioNome: string | null;
  acao: string;
  entidade: string;
  resumo: string | null;
  antes: unknown;
  depois: unknown;
};

export const LIMITE_AUDITORIA = 500;

/** Eventos mais recentes (somente administrador: a RLS já nega para os demais). */
export async function listarAuditoria(ctx: AppContext): Promise<AuditoriaRow[]> {
  const rows = await withScope(ctx, (tx) =>
    tx
      .select({
        id: auditoria.id,
        criadoEm: auditoria.criadoEm,
        usuarioNome: auditoria.usuarioNome,
        acao: auditoria.acao,
        entidade: auditoria.entidade,
        resumo: auditoria.resumo,
        antes: auditoria.antes,
        depois: auditoria.depois,
      })
      .from(auditoria)
      .orderBy(desc(auditoria.criadoEm))
      .limit(LIMITE_AUDITORIA),
  );
  return rows.map((r) => ({ ...r, criadoEm: r.criadoEm.toISOString() }));
}
