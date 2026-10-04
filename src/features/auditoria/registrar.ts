import type { AppContext } from "@/features/auth/context";
import { auditoria } from "@/server/db/schema";
import type { Database } from "@/server/db/scope";
import type { AuditoriaAcao } from "@/lib/domain";

/** Qualquer coisa que insere (a conexão ou uma transação do withScope). */
type Inseridor = Pick<Database, "insert">;

export type EventoAuditoria = {
  acao: AuditoriaAcao;
  entidade: string;
  entidadeId?: string | null;
  empresaId?: string | null;
  resumo?: string;
  antes?: unknown;
  depois?: unknown;
};

const SENSIVEIS = /senha|password|secret|token|credencia|hash/i;

/** Remove campos sensíveis antes de gravar o antes/depois. */
export function sanitizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sanitizar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSIVEIS.test(k) ? "[omitido]" : sanitizar(v),
      ]),
    );
  }
  return valor;
}

/**
 * Registra "quem alterou o quê e quando". Chamar DENTRO da mesma transação da alteração,
 * para que as duas coisas gravem juntas ou nenhuma grave.
 */
export async function registrarAuditoria(
  tx: Inseridor,
  ctx: Pick<AppContext, "userId" | "nome">,
  evento: EventoAuditoria,
): Promise<void> {
  await tx.insert(auditoria).values({
    usuarioId: ctx.userId,
    usuarioNome: ctx.nome,
    acao: evento.acao,
    entidade: evento.entidade,
    entidadeId: evento.entidadeId ?? null,
    empresaId: evento.empresaId ?? null,
    resumo: evento.resumo ?? null,
    antes: evento.antes === undefined ? null : sanitizar(evento.antes),
    depois: evento.depois === undefined ? null : sanitizar(evento.depois),
  });
}
