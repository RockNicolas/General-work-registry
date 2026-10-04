import { and, asc, desc, eq } from "drizzle-orm";
import { registrarAuditoria } from "@/features/auditoria/registrar";
import type { AppContext } from "@/features/auth/context";
import { visivelPorObra } from "@/features/auth/scope-filters";
import { ActionError } from "@/lib/action-result";
import type { Origem } from "@/lib/domain";
import { categoria, etapa, obra, orcamento } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import type { OrcamentoInput } from "./schema";

export type OrcamentoRow = {
  id: string;
  etapaId: string | null;
  etapaLabel: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  descricao: string | null;
  valorPrevistoCentavos: number;
  versao: number;
  vigente: boolean;
  origem: Origem;
};

export async function listarOrcamento(ctx: AppContext, obraId: string): Promise<OrcamentoRow[]> {
  const rows = await withScope(ctx, (tx) =>
    tx
      .select({
        id: orcamento.id,
        etapaId: orcamento.etapaId,
        etapaCodigo: etapa.codigo,
        etapaNome: etapa.nome,
        categoriaId: orcamento.categoriaId,
        categoriaNome: categoria.nome,
        descricao: orcamento.descricao,
        valorPrevistoCentavos: orcamento.valorPrevistoCentavos,
        versao: orcamento.versao,
        vigente: orcamento.vigente,
        origem: orcamento.origem,
      })
      .from(orcamento)
      .leftJoin(etapa, eq(etapa.id, orcamento.etapaId))
      .leftJoin(categoria, eq(categoria.id, orcamento.categoriaId))
      .where(
        and(
          eq(orcamento.obraId, obraId),
          visivelPorObra(ctx, { empresaId: orcamento.empresaId, obraId: orcamento.obraId }),
        ),
      )
      .orderBy(desc(orcamento.vigente), asc(etapa.codigo), asc(categoria.nome)),
  );

  return rows.map(({ etapaCodigo, etapaNome, ...r }) => ({
    ...r,
    etapaLabel: etapaCodigo ? `${etapaCodigo} — ${etapaNome}` : null,
  }));
}

const dadosDe = (i: OrcamentoInput) => ({
  etapaId: i.etapaId || null,
  categoriaId: i.categoriaId || null,
  descricao: i.descricao || null,
  valorPrevistoCentavos: i.valorPrevistoCentavos,
  versao: i.versao,
  vigente: i.vigente,
});

export async function criarOrcamento(ctx: AppContext, input: OrcamentoInput): Promise<{ id: string }> {
  return withScope(ctx, async (tx) => {
    const [o] = await tx.select({ empresaId: obra.empresaId }).from(obra).where(eq(obra.id, input.obraId));
    if (!o) throw new ActionError("Obra não encontrada.");

    const dados = { empresaId: o.empresaId, obraId: input.obraId, ...dadosDe(input), origem: "manual" as const };
    const [criado] = await tx.insert(orcamento).values(dados).returning({ id: orcamento.id });
    await registrarAuditoria(tx, ctx, {
      acao: "criar",
      entidade: "orcamento",
      entidadeId: criado!.id,
      empresaId: o.empresaId,
      resumo: `Item de orçamento criado (v${input.versao}): ${input.valorPrevistoCentavos / 100}`,
      depois: dados,
    });
    return { id: criado!.id };
  });
}

export async function atualizarOrcamento(ctx: AppContext, id: string, input: OrcamentoInput): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(orcamento).where(eq(orcamento.id, id));
    if (!antes || antes.obraId !== input.obraId) throw new ActionError("Item de orçamento não encontrado.");
    if (antes.origem !== "manual") {
      throw new ActionError("Itens vindos de planilha ou do ERP são atualizados pela própria importação/sincronização.");
    }
    const dados = dadosDe(input);
    await tx.update(orcamento).set(dados).where(eq(orcamento.id, id));
    await registrarAuditoria(tx, ctx, {
      acao: "editar",
      entidade: "orcamento",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: "Item de orçamento editado",
      antes: {
        etapaId: antes.etapaId,
        categoriaId: antes.categoriaId,
        valorPrevistoCentavos: antes.valorPrevistoCentavos,
        versao: antes.versao,
        vigente: antes.vigente,
      },
      depois: dados,
    });
  });
}

export async function excluirOrcamento(ctx: AppContext, id: string): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(orcamento).where(eq(orcamento.id, id));
    if (!antes) throw new ActionError("Item de orçamento não encontrado.");
    if (antes.origem !== "manual") {
      throw new ActionError("Itens vindos de planilha ou do ERP não podem ser excluídos aqui.");
    }
    await tx.delete(orcamento).where(eq(orcamento.id, id));
    await registrarAuditoria(tx, ctx, {
      acao: "excluir",
      entidade: "orcamento",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: "Item de orçamento excluído",
      antes: { valorPrevistoCentavos: antes.valorPrevistoCentavos, versao: antes.versao },
    });
  });
}
