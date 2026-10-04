"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { adminAction } from "@/server/actions";
import { avancoSchema } from "./schema";
import { atualizarAvanco, criarAvanco, excluirAvanco } from "./service";

const revalidar = (obraId: string) => [`/obras/${obraId}/avanco`, `/obras/${obraId}`];

export async function criarAvancoAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const obraId = (input as { obraId?: string } | null)?.obraId ?? "";
  return adminAction(avancoSchema, input, (ctx, data) => criarAvanco(ctx, data), { revalidate: revalidar(obraId) });
}

export async function atualizarAvancoAction(id: string, input: unknown): Promise<ActionResult> {
  const obraId = (input as { obraId?: string } | null)?.obraId ?? "";
  return adminAction(
    z.object({ id: z.uuid(), dados: avancoSchema }),
    { id, dados: input },
    async (ctx, data) => {
      await atualizarAvanco(ctx, data.id, data.dados);
    },
    { revalidate: revalidar(obraId) },
  );
}

export async function excluirAvancoAction(obraId: string, id: string): Promise<ActionResult> {
  return adminAction(
    z.object({ id: z.uuid() }),
    { id },
    async (ctx, data) => {
      await excluirAvanco(ctx, data.id);
    },
    { revalidate: revalidar(obraId) },
  );
}
