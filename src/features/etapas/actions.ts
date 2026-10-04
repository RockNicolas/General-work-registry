"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { adminAction } from "@/server/actions";
import { etapaSchema } from "./schema";
import { atualizarEtapa, criarEtapa, excluirEtapa } from "./service";

const revalidar = (obraId: string) => [`/obras/${obraId}/etapas`, `/obras/${obraId}`];

export async function criarEtapaAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const obraId = (input as { obraId?: string } | null)?.obraId ?? "";
  return adminAction(etapaSchema, input, (ctx, data) => criarEtapa(ctx, data), { revalidate: revalidar(obraId) });
}

export async function atualizarEtapaAction(id: string, input: unknown): Promise<ActionResult> {
  const obraId = (input as { obraId?: string } | null)?.obraId ?? "";
  return adminAction(
    z.object({ id: z.uuid(), dados: etapaSchema }),
    { id, dados: input },
    async (ctx, data) => {
      await atualizarEtapa(ctx, data.id, data.dados);
    },
    { revalidate: revalidar(obraId) },
  );
}

export async function excluirEtapaAction(obraId: string, id: string): Promise<ActionResult> {
  return adminAction(
    z.object({ id: z.uuid() }),
    { id },
    async (ctx, data) => {
      await excluirEtapa(ctx, data.id);
    },
    { revalidate: revalidar(obraId) },
  );
}
