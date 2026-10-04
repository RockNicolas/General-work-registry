import { and, asc, count, eq, sql } from "drizzle-orm";
import { registrarAuditoria } from "@/features/auditoria/registrar";
import type { AppContext } from "@/features/auth/context";
import { visivelObra, visivelPorObra } from "@/features/auth/scope-filters";
import { ActionError } from "@/lib/action-result";
import type { ObraStatus } from "@/lib/domain";
import { etapa, lancamento, obra, orcamento, organization } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import type { ObraInput } from "./schema";

export type ObraRow = {
  id: string;
  empresaId: string;
  empresaNome: string;
  codigo: string;
  nome: string;
  status: ObraStatus;
  dataInicio: string | null;
  dataFimPrevista: string | null;
  cidade: string | null;
  uf: string | null;
};

const colunas = {
  id: obra.id,
  empresaId: obra.empresaId,
  empresaNome: organization.name,
  codigo: obra.codigo,
  nome: obra.nome,
  status: obra.status,
  dataInicio: obra.dataInicio,
  dataFimPrevista: obra.dataFimPrevista,
  cidade: obra.cidade,
  uf: obra.uf,
};

export async function listarObras(ctx: AppContext): Promise<ObraRow[]> {
  return withScope(ctx, (tx) =>
    tx
      .select(colunas)
      .from(obra)
      .innerJoin(organization, eq(organization.id, obra.empresaId))
      .where(visivelObra(ctx, obra))
      .orderBy(asc(organization.name), asc(obra.codigo)),
  );
}

/** null quando não existe OU o usuário não pode ver (não revela a diferença). */
export async function buscarObra(ctx: AppContext, id: string): Promise<ObraRow | null> {
  // Ids malformados (uuid inválido) não chegam ao banco.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await withScope(ctx, (tx) =>
    tx
      .select(colunas)
      .from(obra)
      .innerJoin(organization, eq(organization.id, obra.empresaId))
      .where(and(eq(obra.id, id), visivelObra(ctx, obra))),
  );
  return rows[0] ?? null;
}

export type ResumoObra = {
  totalEtapas: number;
  totalLancamentos: number;
  orcamentoCentavos: number;
  custoRealizadoCentavos: number;
  custoComprometidoCentavos: number;
  receitaRealizadaCentavos: number;
};

const soma = (condicao: ReturnType<typeof sql>) =>
  sql<string>`coalesce(sum(${lancamento.valorCentavos}) filter (where ${condicao}), 0)::bigint`;

/** Números rápidos da obra (a análise completa vive nos dashboards). Só operacional entra. */
export async function resumoObra(ctx: AppContext, obraId: string): Promise<ResumoObra> {
  return withScope(ctx, async (tx) => {
    const [etapas] = await tx.select({ n: count() }).from(etapa).where(eq(etapa.obraId, obraId));
    const [orc] = await tx
      .select({ total: sql<string>`coalesce(sum(${orcamento.valorPrevistoCentavos}), 0)::bigint` })
      .from(orcamento)
      .where(and(eq(orcamento.obraId, obraId), eq(orcamento.vigente, true)));
    const [l] = await tx
      .select({
        n: count(),
        custoRealizado: soma(sql`${lancamento.tipo} = 'custo' and ${lancamento.situacao} = 'realizado' and ${lancamento.classe} = 'operacional'`),
        custoComprometido: soma(sql`${lancamento.tipo} = 'custo' and ${lancamento.classe} = 'operacional'`),
        receitaRealizada: soma(sql`${lancamento.tipo} = 'receita' and ${lancamento.situacao} = 'realizado' and ${lancamento.classe} = 'operacional'`),
      })
      .from(lancamento)
      .where(
        and(
          eq(lancamento.obraId, obraId),
          visivelPorObra(ctx, { empresaId: lancamento.empresaId, obraId: lancamento.obraId }),
        ),
      );

    return {
      totalEtapas: etapas?.n ?? 0,
      totalLancamentos: l?.n ?? 0,
      orcamentoCentavos: Number(orc?.total ?? 0),
      custoRealizadoCentavos: Number(l?.custoRealizado ?? 0),
      custoComprometidoCentavos: Number(l?.custoComprometido ?? 0),
      receitaRealizadaCentavos: Number(l?.receitaRealizada ?? 0),
    };
  });
}

const normalizar = (input: ObraInput) => ({
  empresaId: input.empresaId,
  codigo: input.codigo,
  nome: input.nome,
  status: input.status,
  dataInicio: input.dataInicio || null,
  dataFimPrevista: input.dataFimPrevista || null,
  cidade: input.cidade || null,
  uf: input.uf || null,
});

export async function criarObra(ctx: AppContext, input: ObraInput): Promise<{ id: string }> {
  return withScope(ctx, async (tx) => {
    const [empresa] = await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, input.empresaId));
    if (!empresa) throw new ActionError("Empresa não encontrada.", { empresaId: "Empresa inválida" });

    const dados = normalizar(input);
    const [criada] = await tx.insert(obra).values(dados).returning({ id: obra.id });
    await registrarAuditoria(tx, ctx, {
      acao: "criar",
      entidade: "obra",
      entidadeId: criada!.id,
      empresaId: input.empresaId,
      resumo: `Obra criada: ${input.codigo} — ${input.nome}`,
      depois: dados,
    });
    return { id: criada!.id };
  });
}

export async function atualizarObra(ctx: AppContext, id: string, input: ObraInput): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(obra).where(eq(obra.id, id));
    if (!antes) throw new ActionError("Obra não encontrada.");
    if (antes.empresaId !== input.empresaId) {
      throw new ActionError("Não é possível mover uma obra para outra empresa.", { empresaId: "Não pode ser alterada" });
    }

    const dados = normalizar(input);
    await tx.update(obra).set(dados).where(eq(obra.id, id));
    await registrarAuditoria(tx, ctx, {
      acao: "editar",
      entidade: "obra",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: `Obra editada: ${input.codigo} — ${input.nome}`,
      antes: { codigo: antes.codigo, nome: antes.nome, status: antes.status, dataInicio: antes.dataInicio, dataFimPrevista: antes.dataFimPrevista, cidade: antes.cidade, uf: antes.uf },
      depois: dados,
    });
  });
}

export async function excluirObra(ctx: AppContext, id: string): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(obra).where(eq(obra.id, id));
    if (!antes) throw new ActionError("Obra não encontrada.");

    // Etapas, orçamento, avanço e liberações caem em cascata; lançamentos barram a exclusão (FK).
    const [lanc] = await tx.select({ n: count() }).from(lancamento).where(eq(lancamento.obraId, id));
    if ((lanc?.n ?? 0) > 0) {
      throw new ActionError(
        `A obra tem ${lanc!.n} lançamento(s). Para preservar o histórico, marque-a como concluída em vez de excluir.`,
      );
    }

    await tx.delete(obra).where(eq(obra.id, id));
    await registrarAuditoria(tx, ctx, {
      acao: "excluir",
      entidade: "obra",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: `Obra excluída: ${antes.codigo} — ${antes.nome}`,
      antes: { codigo: antes.codigo, nome: antes.nome, status: antes.status },
    });
  });
}
