import { and, desc, eq } from "drizzle-orm";
import { registrarAuditoria } from "@/features/auditoria/registrar";
import type { AppContext } from "@/features/auth/context";
import { visivelPorObra } from "@/features/auth/scope-filters";
import { ActionError } from "@/lib/action-result";
import { parsePercentBps } from "@/lib/percent";
import { avancoFisico, obra } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import type { AvancoLinha } from "./comparativo";
import type { AvancoInput } from "./schema";

export type AvancoRow = AvancoLinha & { id: string };

export async function listarAvanco(ctx: AppContext, obraId: string): Promise<AvancoRow[]> {
  return withScope(ctx, (tx) =>
    tx
      .select({
        id: avancoFisico.id,
        competencia: avancoFisico.competencia,
        tipo: avancoFisico.tipo,
        versao: avancoFisico.versao,
        pctMesBps: avancoFisico.pctMesBps,
        pctAcumBps: avancoFisico.pctAcumBps,
      })
      .from(avancoFisico)
      .where(
        and(
          eq(avancoFisico.obraId, obraId),
          visivelPorObra(ctx, { empresaId: avancoFisico.empresaId, obraId: avancoFisico.obraId }),
        ),
      )
      .orderBy(desc(avancoFisico.competencia), avancoFisico.tipo, desc(avancoFisico.versao)),
  );
}

function dadosDe(i: AvancoInput) {
  return {
    competencia: `${i.competencia}-01`,
    tipo: i.tipo,
    versao: i.versao,
    pctMesBps: parsePercentBps(i.pctMes)!,
    pctAcumBps: parsePercentBps(i.pctAcum)!,
  };
}

export async function criarAvanco(ctx: AppContext, input: AvancoInput): Promise<{ id: string }> {
  return withScope(ctx, async (tx) => {
    const [o] = await tx.select({ empresaId: obra.empresaId }).from(obra).where(eq(obra.id, input.obraId));
    if (!o) throw new ActionError("Obra não encontrada.");

    const dados = { empresaId: o.empresaId, obraId: input.obraId, ...dadosDe(input) };
    const [criado] = await tx.insert(avancoFisico).values(dados).returning({ id: avancoFisico.id });
    await registrarAuditoria(tx, ctx, {
      acao: "criar",
      entidade: "avanco_fisico",
      entidadeId: criado!.id,
      empresaId: o.empresaId,
      resumo: `Avanço ${input.tipo} lançado (${input.competencia}, v${input.versao})`,
      depois: dados,
    });
    return { id: criado!.id };
  });
}

export async function atualizarAvanco(ctx: AppContext, id: string, input: AvancoInput): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(avancoFisico).where(eq(avancoFisico.id, id));
    if (!antes || antes.obraId !== input.obraId) throw new ActionError("Registro de avanço não encontrado.");
    const dados = dadosDe(input);
    await tx.update(avancoFisico).set(dados).where(eq(avancoFisico.id, id));
    await registrarAuditoria(tx, ctx, {
      acao: "editar",
      entidade: "avanco_fisico",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: `Avanço ${input.tipo} editado (${input.competencia}, v${input.versao})`,
      antes: { competencia: antes.competencia, pctMesBps: antes.pctMesBps, pctAcumBps: antes.pctAcumBps },
      depois: dados,
    });
  });
}

export async function excluirAvanco(ctx: AppContext, id: string): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(avancoFisico).where(eq(avancoFisico.id, id));
    if (!antes) throw new ActionError("Registro de avanço não encontrado.");
    await tx.delete(avancoFisico).where(eq(avancoFisico.id, id));
    await registrarAuditoria(tx, ctx, {
      acao: "excluir",
      entidade: "avanco_fisico",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: `Avanço ${antes.tipo} excluído (${antes.competencia}, v${antes.versao})`,
      antes: { competencia: antes.competencia, pctMesBps: antes.pctMesBps, pctAcumBps: antes.pctAcumBps },
    });
  });
}
