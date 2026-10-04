import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { buildContext, type AppContext } from "@/features/auth/context";
import { getDb } from "@/server/db/client";
import {
  auditoria,
  categoria,
  lancamento,
  member,
  obra,
  obraAcesso,
  organization,
  user,
} from "@/server/db/schema";

/**
 * Dois tenants (A e B) com usuários de cada perfil. Tudo com ids prefixados por uma etiqueta
 * aleatória, para poder rodar em qualquer banco (inclusive o develop) sem colidir com dados reais.
 */
export type TenantFixture = Awaited<ReturnType<typeof createTenantFixture>>;

export async function createTenantFixture() {
  const db = getDb();
  const tag = `t${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const id = (name: string) => `${tag}-${name}`;

  const ids = {
    empresaA: id("empresaA"),
    empresaB: id("empresaB"),
    admin: id("admin"),
    userEmpresaA: id("userEmpresaA"),
    userClienteA: id("userClienteA"),
    userEmpresaB: id("userEmpresaB"),
    userSemVinculo: id("userSemVinculo"),
  };

  await db.insert(organization).values([
    { id: ids.empresaA, name: `Empresa A ${tag}`, slug: id("a"), createdAt: new Date() },
    { id: ids.empresaB, name: `Empresa B ${tag}`, slug: id("b"), createdAt: new Date() },
  ]);

  await db.insert(user).values(
    [
      ["admin", "admin"],
      ["userEmpresaA", "user"],
      ["userClienteA", "user"],
      ["userEmpresaB", "user"],
      ["userSemVinculo", "user"],
    ].map(([key, role]) => ({
      id: ids[key as keyof typeof ids],
      name: key!,
      email: `${ids[key as keyof typeof ids]}@teste.local`,
      role,
    })),
  );

  await db.insert(member).values([
    { id: id("m1"), organizationId: ids.empresaA, userId: ids.userEmpresaA, role: "empresa", createdAt: new Date() },
    { id: id("m2"), organizationId: ids.empresaA, userId: ids.userClienteA, role: "cliente", createdAt: new Date() },
    { id: id("m3"), organizationId: ids.empresaB, userId: ids.userEmpresaB, role: "empresa", createdAt: new Date() },
  ]);

  const obras = await db
    .insert(obra)
    .values([
      { empresaId: ids.empresaA, codigo: "A-1", nome: "Obra A1" },
      { empresaId: ids.empresaA, codigo: "A-2", nome: "Obra A2" },
      { empresaId: ids.empresaB, codigo: "B-1", nome: "Obra B1" },
    ])
    .returning({ id: obra.id, codigo: obra.codigo });
  const obraId = Object.fromEntries(obras.map((o) => [o.codigo, o.id])) as Record<"A-1" | "A-2" | "B-1", string>;

  // O cliente de A só tem a obra A1 liberada.
  await db.insert(obraAcesso).values({
    usuarioId: ids.userClienteA,
    obraId: obraId["A-1"],
    empresaId: ids.empresaA,
  });

  const cats = await db
    .insert(categoria)
    .values([
      { empresaId: ids.empresaA, nome: "Cimento", grupo: "material" },
      { empresaId: ids.empresaB, nome: "Cimento", grupo: "material" },
    ])
    .returning({ id: categoria.id, empresaId: categoria.empresaId });
  const categoriaId = {
    A: cats.find((c) => c.empresaId === ids.empresaA)!.id,
    B: cats.find((c) => c.empresaId === ids.empresaB)!.id,
  };

  const lancs = await db
    .insert(lancamento)
    .values(
      (
        [
          ["A-1", ids.empresaA, categoriaId.A],
          ["A-2", ids.empresaA, categoriaId.A],
          ["B-1", ids.empresaB, categoriaId.B],
        ] as const
      ).map(([codigo, empresaId, categoriaId]) => ({
        empresaId,
        obraId: obraId[codigo],
        categoriaId,
        tipo: "custo" as const,
        valorCentavos: 100_000,
        dataCompetencia: "2026-01-10",
        descricao: `lanc ${codigo}`,
      })),
    )
    .returning({ id: lancamento.id, descricao: lancamento.descricao });
  const lancamentoId = Object.fromEntries(lancs.map((l) => [l.descricao!.replace("lanc ", ""), l.id])) as Record<
    "A-1" | "A-2" | "B-1",
    string
  >;

  const ctxFor = async (userId: string): Promise<AppContext> => {
    const [u] = await db.select().from(user).where(inArray(user.id, [userId]));
    const memberships = await db.select().from(member).where(inArray(member.userId, [userId]));
    const acessos = await db.select().from(obraAcesso).where(inArray(obraAcesso.usuarioId, [userId]));
    return buildContext({
      user: u!,
      memberships: memberships.map((m) => ({ organizationId: m.organizationId, role: m.role })),
      acessos: acessos.map((a) => ({ obraId: a.obraId, empresaId: a.empresaId })),
    });
  };

  const ctx = {
    admin: await ctxFor(ids.admin),
    empresaA: await ctxFor(ids.userEmpresaA),
    clienteA: await ctxFor(ids.userClienteA),
    empresaB: await ctxFor(ids.userEmpresaB),
    semVinculo: await ctxFor(ids.userSemVinculo),
  };

  return {
    tag,
    ids,
    obraId,
    categoriaId,
    lancamentoId,
    todasObras: Object.values(obraId),
    ctx,
    /** Remove SOMENTE as linhas desta fixture (por id), na ordem que respeita as FKs. */
    async cleanup() {
      const empresas = [ids.empresaA, ids.empresaB];
      await db.delete(lancamento).where(inArray(lancamento.empresaId, empresas));
      await db.delete(obra).where(inArray(obra.empresaId, empresas)); // cascata em etapa/orcamento/avanco/obra_acesso
      await db.delete(categoria).where(inArray(categoria.empresaId, empresas));
      await db.delete(auditoria).where(inArray(auditoria.empresaId, empresas));
      await db.delete(organization).where(inArray(organization.id, empresas)); // cascata em member
      await db.delete(user).where(inArray(user.id, Object.values(ids)));
    },
  };
}
