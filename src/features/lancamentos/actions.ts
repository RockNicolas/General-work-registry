"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { adminAction } from "@/server/actions";
import { lancamentoSchema } from "./schema";
import { atualizarLancamento, criarLancamento, excluirLancamento } from "./service";

const revalidar = (obraId: string) => [`/obras/${obraId}/lancamentos`, `/obras/${obraId}`];

export async function criarLancamentoAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const obraId = (input as { obraId?: string } | null)?.obraId ?? "";
  return adminAction(lancamentoSchema, input, (ctx, data) => criarLancamento(ctx, data), { revalidate: revalidar(obraId) });
}

export async function atualizarLancamentoAction(id: string, input: unknown): Promise<ActionResult> {
  const obraId = (input as { obraId?: string } | null)?.obraId ?? "";
  return adminAction(
    z.object({ id: z.uuid(), dados: lancamentoSchema }),
    { id, dados: input },
    async (ctx, data) => {
      await atualizarLancamento(ctx, data.id, data.dados);
    },
    { revalidate: revalidar(obraId) },
  );
}

export async function excluirLancamentoAction(obraId: string, id: string): Promise<ActionResult> {
  return adminAction(
    z.object({ id: z.uuid() }),
    { id },
    async (ctx, data) => {
      await excluirLancamento(ctx, data.id);
    },
    { revalidate: revalidar(obraId) },
  );
}
