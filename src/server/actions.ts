import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type { AppContext } from "@/features/auth/context";
import { getAdminContextOrNull } from "@/features/auth/session";
import { ActionError, type ActionResult, fail, failFromZod, ok } from "@/lib/action-result";
import { friendlyDbError } from "@/server/db/errors";

/** Mensagem segura para qualquer erro: conhecidos viram texto útil; os demais, genérico + log. */
export function failFromError(error: unknown): ActionResult<never> {
  if (error instanceof ActionError) return fail(error.message, error.fieldErrors);
  const amigavel = friendlyDbError(error);
  if (amigavel) return fail(amigavel);
  console.error("[action] erro inesperado:", error);
  return fail("Não foi possível concluir a operação. Tente novamente.");
}

/**
 * Molde das Server Actions do Administrador: exige admin, valida a entrada com Zod, executa,
 * invalida as páginas e converte qualquer falha em ActionResult (nada vaza para o cliente).
 */
export async function adminAction<S extends z.ZodType, O>(
  schema: S,
  input: unknown,
  run: (ctx: AppContext, data: z.output<S>) => Promise<O>,
  opts: { revalidate?: string[] } = {},
): Promise<ActionResult<O>> {
  const ctx = await getAdminContextOrNull();
  if (!ctx) return fail("Sem permissão para esta operação. Entre novamente.");

  const parsed = schema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  try {
    const data = await run(ctx, parsed.data);
    for (const path of opts.revalidate ?? []) revalidatePath(path);
    return ok(data) as ActionResult<O>;
  } catch (error) {
    return failFromError(error);
  }
}
