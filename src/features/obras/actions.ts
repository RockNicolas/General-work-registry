"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { adminAction } from "@/server/actions";
import { obraSchema } from "./schema";
import { atualizarObra, criarObra, excluirObra } from "./service";

const REVALIDAR = ["/obras", "/admin/empresas"];

export async function criarObraAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return adminAction(obraSchema, input, (ctx, data) => criarObra(ctx, data), { revalidate: REVALIDAR });
}

export async function atualizarObraAction(id: string, input: unknown): Promise<ActionResult> {
  return adminAction(
    z.object({ id: z.uuid(), dados: obraSchema }),
    { id, dados: input },
    async (ctx, data) => {
      await atualizarObra(ctx, data.id, data.dados);
    },
    { revalidate: [...REVALIDAR, `/obras/${id}`] },
  );
}

export async function excluirObraAction(id: string): Promise<ActionResult> {
  return adminAction(
    z.object({ id: z.uuid() }),
    { id },
    async (ctx, data) => {
      await excluirObra(ctx, data.id);
    },
    { revalidate: REVALIDAR },
  );
}
