import { asc, count, eq, like } from "drizzle-orm";
import { registrarAuditoria } from "@/features/auditoria/registrar";
import type { AppContext } from "@/features/auth/context";
import { ActionError } from "@/lib/action-result";
import { limparCnpj } from "@/lib/cnpj";
import { slugify } from "@/lib/slug";
import { obra, organization } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import type { EmpresaInput } from "./schema";

export type EmpresaRow = {
  id: string;
  nome: string;
  slug: string;
  razaoSocial: string | null;
  cnpj: string | null;
  ativo: boolean;
  totalObras: number;
};

export async function listarEmpresas(ctx: AppContext): Promise<EmpresaRow[]> {
  return withScope(ctx, async (tx) => {
    const empresas = await tx
      .select({
        id: organization.id,
        nome: organization.name,
        slug: organization.slug,
        razaoSocial: organization.razaoSocial,
        cnpj: organization.cnpj,
        ativo: organization.ativo,
      })
      .from(organization)
      .orderBy(asc(organization.name));

    const contagens = await tx
      .select({ empresaId: obra.empresaId, total: count() })
      .from(obra)
      .groupBy(obra.empresaId);
    const porEmpresa = new Map(contagens.map((c) => [c.empresaId, c.total]));

    return empresas.map((e) => ({
      ...e,
      ativo: e.ativo !== false,
      totalObras: porEmpresa.get(e.id) ?? 0,
    }));
  });
}

const normalizar = (input: EmpresaInput) => ({
  name: input.nome,
  razaoSocial: input.razaoSocial || null,
  cnpj: input.cnpj ? limparCnpj(input.cnpj) : null,
  ativo: input.ativo,
});

export async function criarEmpresa(ctx: AppContext, input: EmpresaInput): Promise<{ id: string }> {
  const base = slugify(input.nome);
  if (!base) throw new ActionError("O nome precisa ter letras ou números.", { nome: "Nome inválido" });

  return withScope(ctx, async (tx) => {
    // Slug único: "construtora", "construtora-2", ...
    const existentes = await tx
      .select({ slug: organization.slug })
      .from(organization)
      .where(like(organization.slug, `${base}%`));
    const usados = new Set(existentes.map((e) => e.slug));
    let slug = base;
    for (let n = 2; usados.has(slug); n++) slug = `${base}-${n}`;

    const id = crypto.randomUUID();
    const dados = normalizar(input);
    await tx.insert(organization).values({ id, slug, createdAt: new Date(), ...dados });

    await registrarAuditoria(tx, ctx, {
      acao: "criar",
      entidade: "empresa",
      entidadeId: id,
      empresaId: id,
      resumo: `Empresa criada: ${input.nome}`,
      depois: dados,
    });
    return { id };
  });
}

export async function atualizarEmpresa(ctx: AppContext, id: string, input: EmpresaInput): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(organization).where(eq(organization.id, id));
    if (!antes) throw new ActionError("Empresa não encontrada.");

    const dados = normalizar(input);
    await tx.update(organization).set(dados).where(eq(organization.id, id));

    await registrarAuditoria(tx, ctx, {
      acao: "editar",
      entidade: "empresa",
      entidadeId: id,
      empresaId: id,
      resumo: `Empresa editada: ${input.nome}`,
      antes: { name: antes.name, razaoSocial: antes.razaoSocial, cnpj: antes.cnpj, ativo: antes.ativo },
      depois: dados,
    });
  });
}
