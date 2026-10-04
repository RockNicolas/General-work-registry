import { asc, eq } from "drizzle-orm";
import { registrarAuditoria } from "@/features/auditoria/registrar";
import type { AppContext } from "@/features/auth/context";
import { ActionError } from "@/lib/action-result";
import type { CategoriaGrupo } from "@/lib/domain";
import { categoria, organization } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import type { CategoriaInput } from "./schema";

export type CategoriaRow = {
  id: string;
  empresaId: string;
  empresaNome: string;
  nome: string;
  grupo: CategoriaGrupo;
  codigoOrigem: string | null;
};

/** Conjunto inicial para uma empresa nova; o administrador ajusta depois. */
export const CATEGORIAS_PADRAO: { nome: string; grupo: CategoriaGrupo }[] = [
  { nome: "Materiais de construção", grupo: "material" },
  { nome: "Locação de máquinas e equipamentos", grupo: "maquinas_equipamentos" },
  { nome: "Mão de obra direta", grupo: "mao_obra_direta" },
  { nome: "Mão de obra indireta", grupo: "mao_obra_indireta" },
  { nome: "Serviços de terceiros", grupo: "servicos" },
  { nome: "Despesas administrativas", grupo: "outros" },
  { nome: "Medições e vendas", grupo: "receita" },
];

const colunas = {
  id: categoria.id,
  empresaId: categoria.empresaId,
  empresaNome: organization.name,
  nome: categoria.nome,
  grupo: categoria.grupo,
  codigoOrigem: categoria.codigoOrigem,
};

export async function listarCategorias(ctx: AppContext, empresaId?: string): Promise<CategoriaRow[]> {
  return withScope(ctx, (tx) => {
    const consulta = tx
      .select(colunas)
      .from(categoria)
      .innerJoin(organization, eq(organization.id, categoria.empresaId))
      .orderBy(asc(organization.name), asc(categoria.nome));
    return empresaId ? consulta.where(eq(categoria.empresaId, empresaId)) : consulta;
  });
}

const normalizar = (i: CategoriaInput) => ({
  empresaId: i.empresaId,
  nome: i.nome,
  grupo: i.grupo,
  codigoOrigem: i.codigoOrigem || null,
});

export async function criarCategoria(ctx: AppContext, input: CategoriaInput): Promise<{ id: string }> {
  return withScope(ctx, async (tx) => {
    const dados = normalizar(input);
    const [criada] = await tx.insert(categoria).values(dados).returning({ id: categoria.id });
    await registrarAuditoria(tx, ctx, {
      acao: "criar",
      entidade: "categoria",
      entidadeId: criada!.id,
      empresaId: input.empresaId,
      resumo: `Categoria criada: ${input.nome}`,
      depois: dados,
    });
    return { id: criada!.id };
  });
}

export async function atualizarCategoria(ctx: AppContext, id: string, input: CategoriaInput): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(categoria).where(eq(categoria.id, id));
    if (!antes) throw new ActionError("Categoria não encontrada.");
    if (antes.empresaId !== input.empresaId) {
      throw new ActionError("Não é possível mover a categoria para outra empresa.", { empresaId: "Não pode ser alterada" });
    }
    const dados = normalizar(input);
    await tx.update(categoria).set(dados).where(eq(categoria.id, id));
    await registrarAuditoria(tx, ctx, {
      acao: "editar",
      entidade: "categoria",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: `Categoria editada: ${input.nome}`,
      antes: { nome: antes.nome, grupo: antes.grupo, codigoOrigem: antes.codigoOrigem },
      depois: dados,
    });
  });
}

export async function excluirCategoria(ctx: AppContext, id: string): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(categoria).where(eq(categoria.id, id));
    if (!antes) throw new ActionError("Categoria não encontrada.");
    await tx.delete(categoria).where(eq(categoria.id, id)); // FK barra se houver lançamento/orçamento
    await registrarAuditoria(tx, ctx, {
      acao: "excluir",
      entidade: "categoria",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: `Categoria excluída: ${antes.nome}`,
      antes: { nome: antes.nome, grupo: antes.grupo },
    });
  });
}

/** Cria as categorias padrão que ainda não existem na empresa. Devolve quantas foram criadas. */
export async function criarCategoriasPadrao(ctx: AppContext, empresaId: string): Promise<{ criadas: number }> {
  return withScope(ctx, async (tx) => {
    const [empresa] = await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, empresaId));
    if (!empresa) throw new ActionError("Empresa não encontrada.");

    const criadas = await tx
      .insert(categoria)
      .values(CATEGORIAS_PADRAO.map((c) => ({ empresaId, ...c })))
      .onConflictDoNothing()
      .returning({ id: categoria.id });

    await registrarAuditoria(tx, ctx, {
      acao: "criar",
      entidade: "categoria",
      empresaId,
      resumo: `Categorias padrão aplicadas (${criadas.length} nova(s))`,
    });
    return { criadas: criadas.length };
  });
}
