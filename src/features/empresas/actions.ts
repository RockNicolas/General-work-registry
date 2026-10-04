"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { adminAction } from "@/server/actions";
import { empresaSchema } from "./schema";
import { atualizarEmpresa, criarEmpresa } from "./service";

const REVALIDAR = ["/admin/empresas", "/obras"];

export async function criarEmpresaAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return adminAction(empresaSchema, input, (ctx, data) => criarEmpresa(ctx, data), { revalidate: REVALIDAR });
}

export async function atualizarEmpresaAction(id: string, input: unknown): Promise<ActionResult> {
  return adminAction(
    z.object({ id: z.string().min(1), dados: empresaSchema }),
    { id, dados: input },
    async (ctx, data) => {
      await atualizarEmpresa(ctx, data.id, data.dados);
    },
    { revalidate: REVALIDAR },
  );
}
