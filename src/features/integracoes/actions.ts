"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { adminAction } from "@/server/actions";
import { agendarIntegracao } from "./fila";
import { atualizarIntegracaoSchema, criarIntegracaoSchema, criarObrasDoErpSchema, vinculosSchema } from "./schema";
import {
  type ObraDoErp,
  atualizarIntegracao,
  criarIntegracao,
  criarObrasDoErp,
  desativarWebhook,
  excluirIntegracao,
  gerarSegredoDoWebhook,
  listarObrasDoErp,
  registrarWebhookNoErp,
  salvarVinculos,
  solicitarSincronizacao,
  testarConexaoIntegracao,
} from "./service";

const REVALIDAR = ["/admin/integracoes"];
const aoDetalhe = (id: string) => [...REVALIDAR, `/admin/integracoes/${id}`];
const schemaId = z.object({ id: z.uuid() });

/** O agendamento é um "extra": se a fila estiver fora do ar a integração é salva mesmo assim (o worker reconcilia ao subir). */
async function agendarSemFalhar(id: string, cron: string | null) {
  try {
    await agendarIntegracao(id, cron);
  } catch (erro) {
    console.warn("[integracoes] não foi possível agendar agora (o worker reconcilia ao iniciar):", erro instanceof Error ? erro.message : erro);
  }
}

export async function criarIntegracaoAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return adminAction(
    criarIntegracaoSchema,
    input,
    async (ctx, d) => {
      const { id, cron } = await criarIntegracao(ctx, d);
      if (cron) await agendarSemFalhar(id, cron);
      return { id };
    },
    { revalidate: REVALIDAR },
  );
}

export async function atualizarIntegracaoAction(id: string, input: unknown): Promise<ActionResult> {
  return adminAction(
    z.object({ id: z.uuid(), dados: atualizarIntegracaoSchema }),
    { id, dados: input },
    async (ctx, d) => {
      const { cron } = await atualizarIntegracao(ctx, d.id, d.dados);
      await agendarSemFalhar(d.id, cron);
    },
    { revalidate: aoDetalhe(id) },
  );
}

export async function excluirIntegracaoAction(id: string): Promise<ActionResult> {
  return adminAction(
    schemaId,
    { id },
    async (ctx, d) => {
      await excluirIntegracao(ctx, d.id);
      await agendarSemFalhar(d.id, null);
    },
    { revalidate: REVALIDAR },
  );
}

export async function testarConexaoAction(id: string): Promise<ActionResult<{ ok: boolean; mensagem: string }>> {
  return adminAction(schemaId, { id }, (ctx, d) => testarConexaoIntegracao(ctx, d.id), { revalidate: aoDetalhe(id) });
}

export async function listarObrasDoErpAction(id: string): Promise<ActionResult<ObraDoErp[]>> {
  return adminAction(schemaId, { id }, (ctx, d) => listarObrasDoErp(ctx, d.id));
}

export async function salvarVinculosAction(input: unknown): Promise<ActionResult> {
  const id = (input as { integracaoId?: string } | null)?.integracaoId ?? "";
  return adminAction(
    vinculosSchema,
    input,
    async (ctx, d) => {
      await salvarVinculos(ctx, d.integracaoId, d.vinculos);
    },
    { revalidate: aoDetalhe(id) },
  );
}

export async function criarObrasDoErpAction(input: unknown): Promise<ActionResult<{ criadas: number }>> {
  const id = (input as { integracaoId?: string } | null)?.integracaoId ?? "";
  return adminAction(criarObrasDoErpSchema, input, (ctx, d) => criarObrasDoErp(ctx, d.integracaoId, d.obras), { revalidate: [...aoDetalhe(id), "/obras"] });
}

export async function sincronizarAction(id: string, tipo: "incremental" | "historica"): Promise<ActionResult<{ sincronizacaoId: string }>> {
  return adminAction(z.object({ id: z.uuid(), tipo: z.enum(["incremental", "historica"]) }), { id, tipo }, (ctx, d) => solicitarSincronizacao(ctx, d.id, d.tipo), {
    revalidate: aoDetalhe(id),
  });
}

export async function gerarSegredoWebhookAction(id: string): Promise<ActionResult<{ segredo: string; url: string }>> {
  return adminAction(schemaId, { id }, (ctx, d) => gerarSegredoDoWebhook(ctx, d.id), { revalidate: aoDetalhe(id) });
}

export async function desativarWebhookAction(id: string): Promise<ActionResult> {
  return adminAction(
    schemaId,
    { id },
    async (ctx, d) => {
      await desativarWebhook(ctx, d.id);
    },
    { revalidate: aoDetalhe(id) },
  );
}

export async function registrarWebhookAction(id: string, eventos: string[]): Promise<ActionResult<{ url: string; hookId: string }>> {
  return adminAction(
    z.object({ id: z.uuid(), eventos: z.array(z.string().trim().min(1).max(80)).min(1, "Informe ao menos um evento").max(30) }),
    { id, eventos },
    (ctx, d) => registrarWebhookNoErp(ctx, d.id, d.eventos),
    { revalidate: aoDetalhe(id) },
  );
}
