"use server";

import { z } from "zod";
import { atualizarUsuario, criarUsuario, redefinirSenha } from "@/features/auth/usuarios-admin";
import type { ActionResult } from "@/lib/action-result";
import { adminAction } from "@/server/actions";
import { atualizarUsuarioSchema, criarUsuarioSchema, redefinirSenhaSchema } from "./schema";

const REVALIDAR = ["/admin/usuarios"];

export async function criarUsuarioAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return adminAction(criarUsuarioSchema, input, (ctx, data) => criarUsuario(ctx, data), { revalidate: REVALIDAR });
}

export async function atualizarUsuarioAction(id: string, input: unknown): Promise<ActionResult> {
  return adminAction(
    z.object({ id: z.string().min(1), dados: atualizarUsuarioSchema }),
    { id, dados: input },
    async (ctx, data) => {
      await atualizarUsuario(ctx, data.id, data.dados);
    },
    { revalidate: REVALIDAR },
  );
}

export async function redefinirSenhaAction(id: string, input: unknown): Promise<ActionResult> {
  return adminAction(
    z.object({ id: z.string().min(1), dados: redefinirSenhaSchema }),
    { id, dados: input },
    async (ctx, data) => {
      await redefinirSenha(ctx, data.id, data.dados.senha);
    },
    { revalidate: REVALIDAR },
  );
}
