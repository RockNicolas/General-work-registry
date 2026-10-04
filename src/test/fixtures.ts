import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { buildContext, type AppContext } from "@/features/auth/context";
import { getDb } from "@/server/db/client";
import { member, obra, obraAcesso, organization, user } from "@/server/db/schema";

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
    todasObras: Object.values(obraId),
    ctx,
    /** Remove SOMENTE as linhas desta fixture (por id), na ordem que respeita as FKs. */
    async cleanup() {
      const empresas = [ids.empresaA, ids.empresaB];
      await db.delete(obra).where(inArray(obra.empresaId, empresas)); // cascata em obra_acesso
      await db.delete(organization).where(inArray(organization.id, empresas)); // cascata em member
      await db.delete(user).where(inArray(user.id, Object.values(ids)));
    },
  };
}
