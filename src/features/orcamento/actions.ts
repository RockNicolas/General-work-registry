"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { adminAction } from "@/server/actions";
import { orcamentoSchema } from "./schema";
import { atualizarOrcamento, criarOrcamento, excluirOrcamento } from "./service";

const revalidar = (obraId: string) => [`/obras/${obraId}/orcamento`, `/obras/${obraId}`];

export async function criarOrcamentoAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const obraId = (input as { obraId?: string } | null)?.obraId ?? "";
  return adminAction(orcamentoSchema, input, (ctx, data) => criarOrcamento(ctx, data), { revalidate: revalidar(obraId) });
}

export async function atualizarOrcamentoAction(id: string, input: unknown): Promise<ActionResult> {
  const obraId = (input as { obraId?: string } | null)?.obraId ?? "";
  return adminAction(
    z.object({ id: z.uuid(), dados: orcamentoSchema }),
    { id, dados: input },
    async (ctx, data) => {
      await atualizarOrcamento(ctx, data.id, data.dados);
    },
    { revalidate: revalidar(obraId) },
  );
}

export async function excluirOrcamentoAction(obraId: string, id: string): Promise<ActionResult> {
  return adminAction(
    z.object({ id: z.uuid() }),
    { id },
    async (ctx, data) => {
      await excluirOrcamento(ctx, data.id);
    },
    { revalidate: revalidar(obraId) },
  );
}
