import { and, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { registrarAuditoria } from "@/features/auditoria/registrar";
import type { AppContext } from "@/features/auth/context";
import { visivelPorObra } from "@/features/auth/scope-filters";
import { ActionError } from "@/lib/action-result";
import type { LancamentoClasse, LancamentoSituacao, LancamentoTipo, Origem } from "@/lib/domain";
import { categoria, etapa, lancamento, obra } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import type { FiltrosLancamento, LancamentoInput } from "./schema";

export const TAMANHO_PAGINA = 25;

export type LancamentoRow = {
  id: string;
  tipo: LancamentoTipo;
  situacao: LancamentoSituacao;
  classe: LancamentoClasse;
  isPrevisao: boolean;
  valorCentavos: number;
  dataCompetencia: string;
  dataVencimento: string | null;
  dataLiquidacao: string | null;
  categoriaId: string;
  categoriaNome: string;
  etapaId: string | null;
  etapaLabel: string | null;
  contraparte: string | null;
  documento: string | null;
  descricao: string | null;
  origem: Origem;
};

export type PaginaLancamentos = {
  rows: LancamentoRow[];
  total: number;
  pagina: number;
  totalPaginas: number;
  somaCustoCentavos: number;
  somaReceitaCentavos: number;
};

/** Escapa % e _ para o usuário buscar o texto literal. */
const likeSeguro = (t: string) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Filtros da listagem (a mesma regra para a tela e para a exportação): visibilidade + obra + filtros da URL. */
function condicoesDeLancamentos(ctx: AppContext, obraId: string, filtros: FiltrosLancamento) {
  return and(
    eq(lancamento.obraId, obraId),
    visivelPorObra(ctx, { empresaId: lancamento.empresaId, obraId: lancamento.obraId }),
    filtros.tipo ? eq(lancamento.tipo, filtros.tipo) : undefined,
    filtros.situacao ? eq(lancamento.situacao, filtros.situacao) : undefined,
    filtros.classe ? eq(lancamento.classe, filtros.classe) : undefined,
    filtros.de ? gte(lancamento.dataCompetencia, filtros.de) : undefined,
    filtros.ate ? lte(lancamento.dataCompetencia, filtros.ate) : undefined,
    filtros.q
      ? or(
          ilike(lancamento.contraparte, likeSeguro(filtros.q)),
          ilike(lancamento.descricao, likeSeguro(filtros.q)),
          ilike(lancamento.documento, likeSeguro(filtros.q)),
        )
      : undefined,
  );
}

const colunasDeLinha = {
  id: lancamento.id,
  tipo: lancamento.tipo,
  situacao: lancamento.situacao,
  classe: lancamento.classe,
  isPrevisao: lancamento.isPrevisao,
  valorCentavos: lancamento.valorCentavos,
  dataCompetencia: lancamento.dataCompetencia,
  dataVencimento: lancamento.dataVencimento,
  dataLiquidacao: lancamento.dataLiquidacao,
  categoriaId: lancamento.categoriaId,
  categoriaNome: categoria.nome,
  etapaId: lancamento.etapaId,
  etapaCodigo: etapa.codigo,
  etapaNome: etapa.nome,
  contraparte: lancamento.contraparte,
  documento: lancamento.documento,
  descricao: lancamento.descricao,
  origem: lancamento.origem,
};

type LinhaBruta = { etapaCodigo: string | null; etapaNome: string | null } & Omit<LancamentoRow, "etapaLabel">;
const paraRow = ({ etapaCodigo, etapaNome, ...r }: LinhaBruta): LancamentoRow => ({ ...r, etapaLabel: etapaCodigo ? `${etapaCodigo} — ${etapaNome}` : null });

export async function listarLancamentos(
  ctx: AppContext,
  obraId: string,
  filtros: FiltrosLancamento,
): Promise<PaginaLancamentos> {
  const where = condicoesDeLancamentos(ctx, obraId, filtros);

  return withScope(ctx, async (tx) => {
    const [agregado] = await tx
      .select({
        total: count(),
        custo: sql<string>`coalesce(sum(${lancamento.valorCentavos}) filter (where ${lancamento.tipo} = 'custo'), 0)::bigint`,
        receita: sql<string>`coalesce(sum(${lancamento.valorCentavos}) filter (where ${lancamento.tipo} = 'receita'), 0)::bigint`,
      })
      .from(lancamento)
      .where(where);

    const total = agregado?.total ?? 0;
    const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
    const pagina = Math.min(filtros.pagina, totalPaginas);

    const rows = await tx
      .select(colunasDeLinha)
      .from(lancamento)
      .innerJoin(categoria, eq(categoria.id, lancamento.categoriaId))
      .leftJoin(etapa, eq(etapa.id, lancamento.etapaId))
      .where(where)
      .orderBy(desc(lancamento.dataCompetencia), desc(lancamento.createdAt), desc(lancamento.id))
      .limit(TAMANHO_PAGINA)
      .offset((pagina - 1) * TAMANHO_PAGINA);

    return {
      rows: rows.map(paraRow),
      total,
      pagina,
      totalPaginas,
      somaCustoCentavos: Number(agregado?.custo ?? 0),
      somaReceitaCentavos: Number(agregado?.receita ?? 0),
    };
  });
}

/** Teto do Excel: acima disso o usuário precisa refinar os filtros. */
export const LIMITE_EXPORTACAO_LANCAMENTOS = 50_000;
/** Teto do PDF (relatório para ler e imprimir). O conjunto maior vai no Excel. */
export const LIMITE_EXPORTACAO_LANCAMENTOS_PDF = 2_000;

export type LancamentosParaExportar = { rows: LancamentoRow[]; total: number; excedeLimite: boolean; somaCustoCentavos: number; somaReceitaCentavos: number };

/** Todos os lançamentos que a listagem mostraria (mesmos filtros, sem paginar), até o teto. */
export async function listarLancamentosParaExportar(
  ctx: AppContext,
  obraId: string,
  filtros: FiltrosLancamento,
  limite: number = LIMITE_EXPORTACAO_LANCAMENTOS,
): Promise<LancamentosParaExportar> {
  const where = condicoesDeLancamentos(ctx, obraId, filtros);
  return withScope(ctx, async (tx) => {
    const [agregado] = await tx
      .select({
        total: count(),
        custo: sql<string>`coalesce(sum(${lancamento.valorCentavos}) filter (where ${lancamento.tipo} = 'custo'), 0)::bigint`,
        receita: sql<string>`coalesce(sum(${lancamento.valorCentavos}) filter (where ${lancamento.tipo} = 'receita'), 0)::bigint`,
      })
      .from(lancamento)
      .where(where);
    const total = agregado?.total ?? 0;
    const resumo = { total, somaCustoCentavos: Number(agregado?.custo ?? 0), somaReceitaCentavos: Number(agregado?.receita ?? 0) };
    if (total > limite) return { ...resumo, rows: [], excedeLimite: true };

    const rows = await tx
      .select(colunasDeLinha)
      .from(lancamento)
      .innerJoin(categoria, eq(categoria.id, lancamento.categoriaId))
      .leftJoin(etapa, eq(etapa.id, lancamento.etapaId))
      .where(where)
      .orderBy(desc(lancamento.dataCompetencia), desc(lancamento.createdAt), desc(lancamento.id));
    return { ...resumo, rows: rows.map(paraRow), excedeLimite: false };
  });
}

const dadosDe = (i: LancamentoInput) => ({
  tipo: i.tipo,
  situacao: i.situacao,
  classe: i.classe,
  isPrevisao: i.isPrevisao,
  valorCentavos: i.valorCentavos,
  dataCompetencia: i.dataCompetencia,
  dataVencimento: i.dataVencimento || null,
  dataLiquidacao: i.dataLiquidacao || null,
  categoriaId: i.categoriaId,
  etapaId: i.etapaId || null,
  contraparte: i.contraparte || null,
  documento: i.documento || null,
  descricao: i.descricao || null,
});

export async function criarLancamento(ctx: AppContext, input: LancamentoInput): Promise<{ id: string }> {
  return withScope(ctx, async (tx) => {
    const [o] = await tx.select({ empresaId: obra.empresaId }).from(obra).where(eq(obra.id, input.obraId));
    if (!o) throw new ActionError("Obra não encontrada.");

    const dados = { empresaId: o.empresaId, obraId: input.obraId, ...dadosDe(input), origem: "manual" as const };
    const [criado] = await tx.insert(lancamento).values(dados).returning({ id: lancamento.id });
    await registrarAuditoria(tx, ctx, {
      acao: "criar",
      entidade: "lancamento",
      entidadeId: criado!.id,
      empresaId: o.empresaId,
      resumo: `Lançamento manual criado (${input.tipo}, ${input.valorCentavos / 100})`,
      depois: dados,
    });
    return { id: criado!.id };
  });
}

export async function atualizarLancamento(ctx: AppContext, id: string, input: LancamentoInput): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(lancamento).where(eq(lancamento.id, id));
    if (!antes || antes.obraId !== input.obraId) throw new ActionError("Lançamento não encontrado.");
    if (antes.origem !== "manual") {
      throw new ActionError("Lançamentos de planilha ou do ERP são atualizados pela importação/sincronização.");
    }
    const dados = dadosDe(input);
    await tx.update(lancamento).set(dados).where(eq(lancamento.id, id));
    await registrarAuditoria(tx, ctx, {
      acao: "editar",
      entidade: "lancamento",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: "Lançamento manual editado",
      antes: {
        tipo: antes.tipo,
        situacao: antes.situacao,
        classe: antes.classe,
        valorCentavos: antes.valorCentavos,
        dataCompetencia: antes.dataCompetencia,
        categoriaId: antes.categoriaId,
      },
      depois: dados,
    });
  });
}

export async function excluirLancamento(ctx: AppContext, id: string): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(lancamento).where(eq(lancamento.id, id));
    if (!antes) throw new ActionError("Lançamento não encontrado.");
    if (antes.origem !== "manual") {
      throw new ActionError("Lançamentos de planilha ou do ERP não podem ser excluídos aqui.");
    }
    await tx.delete(lancamento).where(eq(lancamento.id, id));
    await registrarAuditoria(tx, ctx, {
      acao: "excluir",
      entidade: "lancamento",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: `Lançamento manual excluído (${antes.tipo}, ${antes.valorCentavos / 100})`,
      antes: { tipo: antes.tipo, valorCentavos: antes.valorCentavos, dataCompetencia: antes.dataCompetencia },
    });
  });
}
