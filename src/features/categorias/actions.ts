"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { adminAction } from "@/server/actions";
import { categoriaSchema, categoriasPadraoSchema } from "./schema";
import { atualizarCategoria, criarCategoria, criarCategoriasPadrao, excluirCategoria } from "./service";

const REVALIDAR = ["/admin/categorias"];

export async function criarCategoriaAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return adminAction(categoriaSchema, input, (ctx, data) => criarCategoria(ctx, data), { revalidate: REVALIDAR });
}

export async function atualizarCategoriaAction(id: string, input: unknown): Promise<ActionResult> {
  return adminAction(
    z.object({ id: z.uuid(), dados: categoriaSchema }),
    { id, dados: input },
    async (ctx, data) => {
      await atualizarCategoria(ctx, data.id, data.dados);
    },
    { revalidate: REVALIDAR },
  );
}

export async function excluirCategoriaAction(id: string): Promise<ActionResult> {
  return adminAction(
    z.object({ id: z.uuid() }),
    { id },
    async (ctx, data) => {
      await excluirCategoria(ctx, data.id);
    },
    { revalidate: REVALIDAR },
  );
}

export async function criarCategoriasPadraoAction(input: unknown): Promise<ActionResult<{ criadas: number }>> {
  return adminAction(categoriasPadraoSchema, input, (ctx, data) => criarCategoriasPadrao(ctx, data.empresaId), {
    revalidate: REVALIDAR,
  });
}
