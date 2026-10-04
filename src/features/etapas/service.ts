import { and, eq } from "drizzle-orm";
import { registrarAuditoria } from "@/features/auditoria/registrar";
import type { AppContext } from "@/features/auth/context";
import { visivelPorObra } from "@/features/auth/scope-filters";
import { ActionError } from "@/lib/action-result";
import { etapa, obra } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import type { EtapaInput } from "./schema";

export type EtapaRow = {
  id: string;
  codigo: string;
  nome: string;
  paiId: string | null;
  /** 0 = primeiro nível. */
  nivel: number;
};

const natural = new Intl.Collator("pt-BR", { numeric: true });

/** Ordena por código "natural" (1.2 antes de 1.10) e calcula o nível pela cadeia de pais. */
export function organizarEtapas(rows: { id: string; codigo: string; nome: string; paiId: string | null }[]): EtapaRow[] {
  const porId = new Map(rows.map((r) => [r.id, r]));
  const nivel = (id: string): number => {
    let n = 0;
    const vistos = new Set<string>();
    let atual = porId.get(id)?.paiId ?? null;
    while (atual && !vistos.has(atual)) {
      vistos.add(atual);
      n++;
      atual = porId.get(atual)?.paiId ?? null;
    }
    return n;
  };
  return [...rows]
    .sort((a, b) => natural.compare(a.codigo, b.codigo))
    .map((r) => ({ ...r, nivel: nivel(r.id) }));
}

/** Ids da etapa e de todos os seus descendentes (para impedir ciclos ao trocar o pai). */
export function descendentesDe(id: string, rows: { id: string; paiId: string | null }[]): Set<string> {
  const resultado = new Set<string>([id]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const r of rows) {
      if (r.paiId && resultado.has(r.paiId) && !resultado.has(r.id)) {
        resultado.add(r.id);
        mudou = true;
      }
    }
  }
  return resultado;
}

export async function listarEtapas(ctx: AppContext, obraId: string): Promise<EtapaRow[]> {
  const rows = await withScope(ctx, (tx) =>
    tx
      .select({ id: etapa.id, codigo: etapa.codigo, nome: etapa.nome, paiId: etapa.paiId })
      .from(etapa)
      .where(and(eq(etapa.obraId, obraId), visivelPorObra(ctx, { empresaId: etapa.empresaId, obraId: etapa.obraId }))),
  );
  return organizarEtapas(rows);
}

async function empresaDaObra(tx: Parameters<Parameters<typeof withScope>[1]>[0], obraId: string): Promise<string> {
  const [o] = await tx.select({ empresaId: obra.empresaId }).from(obra).where(eq(obra.id, obraId));
  if (!o) throw new ActionError("Obra não encontrada.");
  return o.empresaId;
}

export async function criarEtapa(ctx: AppContext, input: EtapaInput): Promise<{ id: string }> {
  return withScope(ctx, async (tx) => {
    const empresaId = await empresaDaObra(tx, input.obraId);
    const dados = { empresaId, obraId: input.obraId, codigo: input.codigo, nome: input.nome, paiId: input.paiId || null };
    const [criada] = await tx.insert(etapa).values(dados).returning({ id: etapa.id });
    await registrarAuditoria(tx, ctx, {
      acao: "criar",
      entidade: "etapa",
      entidadeId: criada!.id,
      empresaId,
      resumo: `Etapa criada: ${input.codigo} — ${input.nome}`,
      depois: dados,
    });
    return { id: criada!.id };
  });
}

export async function atualizarEtapa(ctx: AppContext, id: string, input: EtapaInput): Promise<void> {
  await withScope(ctx, async (tx) => {
    const todas = await tx
      .select({ id: etapa.id, paiId: etapa.paiId, obraId: etapa.obraId })
      .from(etapa)
      .where(eq(etapa.obraId, input.obraId));
    const [antes] = await tx.select().from(etapa).where(eq(etapa.id, id));
    if (!antes || antes.obraId !== input.obraId) throw new ActionError("Etapa não encontrada.");

    if (input.paiId && descendentesDe(id, todas).has(input.paiId)) {
      throw new ActionError("A etapa-pai não pode ser a própria etapa nem uma de suas filhas.", {
        paiId: "Escolha outra etapa-pai",
      });
    }

    const dados = { codigo: input.codigo, nome: input.nome, paiId: input.paiId || null };
    await tx.update(etapa).set(dados).where(eq(etapa.id, id));
    await registrarAuditoria(tx, ctx, {
      acao: "editar",
      entidade: "etapa",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: `Etapa editada: ${input.codigo} — ${input.nome}`,
      antes: { codigo: antes.codigo, nome: antes.nome, paiId: antes.paiId },
      depois: dados,
    });
  });
}

export async function excluirEtapa(ctx: AppContext, id: string): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(etapa).where(eq(etapa.id, id));
    if (!antes) throw new ActionError("Etapa não encontrada.");
    await tx.delete(etapa).where(eq(etapa.id, id)); // FKs barram se houver filhas, lançamentos ou orçamento
    await registrarAuditoria(tx, ctx, {
      acao: "excluir",
      entidade: "etapa",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: `Etapa excluída: ${antes.codigo} — ${antes.nome}`,
      antes: { codigo: antes.codigo, nome: antes.nome },
    });
  });
}
