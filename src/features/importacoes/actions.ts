"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { adminAction } from "@/server/actions";
import { cancelarImportacao, confirmarImportacao, type ResumoImportacao } from "./service";

const schemaId = z.object({ id: z.uuid() });

export async function confirmarImportacaoAction(id: string): Promise<ActionResult<ResumoImportacao>> {
  return adminAction(schemaId, { id }, (ctx, data) => confirmarImportacao(ctx, data.id), {
    revalidate: ["/importacoes", `/importacoes/${id}`, "/obras"],
  });
}

export async function cancelarImportacaoAction(id: string): Promise<ActionResult> {
  return adminAction(
    schemaId,
    { id },
    async (ctx, data) => {
      await cancelarImportacao(ctx, data.id);
    },
    { revalidate: ["/importacoes"] },
  );
}
