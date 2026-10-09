import { registrarAuditoria } from "@/features/auditoria/registrar";
import type { AppContext } from "@/features/auth/context";
import { withScope } from "@/server/db/scope";

export type EventoExportacao = {
  empresaId: string | null;
  entidade: string;
  entidadeId?: string;
  resumo: string;
  depois?: unknown;
};

/**
 * Registra "quem exportou o quê". Vale para qualquer perfil que possa exportar (a política de
 * auditoria só aceita eventos `exportar`, e só em nome de empresa de que o usuário seja membro).
 * É chamado DEPOIS de gerar o arquivo e ANTES de entregá-lo: se o registro falhar, o arquivo não sai.
 */
export async function registrarExportacao(ctx: AppContext, e: EventoExportacao): Promise<void> {
  await withScope(ctx, (tx) =>
    registrarAuditoria(tx, ctx, { acao: "exportar", entidade: e.entidade, entidadeId: e.entidadeId, empresaId: e.empresaId, resumo: e.resumo, depois: e.depois }),
  );
}

/**
 * A empresa a que a exportação é atribuída na auditoria: a pedida, se o usuário a enxerga; senão a
 * única que ele enxerga; senão nenhuma (consolidado). Nunca uma empresa que não seja dele.
 */
export function empresaDaAuditoria(visiveis: { id: string }[], pedida?: string): string | null {
  if (pedida && visiveis.some((e) => e.id === pedida)) return pedida;
  return visiveis.length === 1 ? visiveis[0]!.id : null;
}
