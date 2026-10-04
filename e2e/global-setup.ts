import { and, eq, inArray, like, notInArray } from "drizzle-orm";
import { upsertUsuarioCredencial } from "../src/server/auth-users";
import { getDb, getPool } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";
import { CATEGORIAS_PADRAO } from "../src/features/categorias/service";
import { auditoria, categoria, importacao, lancamento, member, obra, obraAcesso, organization, user } from "../src/server/db/schema";
import { E2E } from "./users";

/** Remove o que execuções anteriores do e2e criaram pela interface (nomes com prefixo E2E). */
async function limparResiduos() {
  const db = getDb();
  const fixas = [E2E.empresa.id, E2E.outraEmpresa.id];
  const codigosFixos = [E2E.obras.a1.codigo, E2E.obras.a2.codigo, E2E.obras.b1.codigo];

  // Lançamentos e importações que testes anteriores criaram nas empresas fixas.
  await db.delete(lancamento).where(inArray(lancamento.empresaId, fixas));
  await db.delete(importacao).where(inArray(importacao.empresaId, fixas));

  // Obras extras nas empresas fixas.
  const extras = await db
    .select({ id: obra.id })
    .from(obra)
    .where(and(inArray(obra.empresaId, fixas), notInArray(obra.codigo, codigosFixos)));
  if (extras.length) {
    const ids = extras.map((o) => o.id);
    await db.delete(lancamento).where(inArray(lancamento.obraId, ids));
    await db.delete(obra).where(inArray(obra.id, ids));
  }

  // Empresas criadas pela interface (nome E2E Construtora ...) e tudo que pende delas.
  const criadas = await db
    .select({ id: organization.id })
    .from(organization)
    .where(like(organization.name, "E2E Construtora %"));
  if (criadas.length) {
    const ids = criadas.map((o) => o.id);
    await db.delete(lancamento).where(inArray(lancamento.empresaId, ids));
    await db.delete(importacao).where(inArray(importacao.empresaId, ids));
    await db.delete(obra).where(inArray(obra.empresaId, ids));
    await db.delete(categoria).where(inArray(categoria.empresaId, ids));
    await db.delete(auditoria).where(inArray(auditoria.empresaId, ids));
    await db.delete(organization).where(inArray(organization.id, ids));
  }

  // Usuários criados pela interface.
  await db.delete(user).where(like(user.email, "cli-%@rgo.test"));
}

/**
 * Prepara o banco para o e2e: migrations + usuários, empresas e obras fixas. Idempotente, então
 * pode rodar repetidas vezes no banco develop sem acumular lixo.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente: o e2e precisa de um Postgres (branch develop).");
  await runMigrations(url);

  const db = getDb();
  for (const e of [E2E.empresa, E2E.outraEmpresa]) {
    await db
      .insert(organization)
      .values({ id: e.id, name: e.nome, slug: e.slug, createdAt: new Date() })
      .onConflictDoNothing();
  }

  await limparResiduos();

  // A empresa fixa precisa de categorias para os testes de lançamento.
  await db
    .insert(categoria)
    .values(CATEGORIAS_PADRAO.map((c) => ({ empresaId: E2E.empresa.id, ...c })))
    .onConflictDoNothing();

  const obraIds: Record<string, string> = {};
  for (const [empresaId, o] of [
    [E2E.empresa.id, E2E.obras.a1],
    [E2E.empresa.id, E2E.obras.a2],
    [E2E.outraEmpresa.id, E2E.obras.b1],
  ] as const) {
    await db.insert(obra).values({ empresaId, codigo: o.codigo, nome: o.nome, status: "ativa" }).onConflictDoNothing();
    const [linha] = await db
      .select({ id: obra.id })
      .from(obra)
      .where(and(eq(obra.empresaId, empresaId), eq(obra.codigo, o.codigo)));
    obraIds[o.codigo] = linha!.id;
  }

  for (const u of [E2E.admin, E2E.empresaUser, E2E.clienteUser, E2E.semVinculo]) {
    const { id } = await upsertUsuarioCredencial({
      email: u.email,
      name: u.nome,
      password: E2E.senha,
      role: u === E2E.admin ? "admin" : "user",
    });
    if (u.membro) {
      await db
        .insert(member)
        .values({
          id: `e2e-m-${u.membro}`,
          organizationId: E2E.empresa.id,
          userId: id,
          role: u.membro,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }
    if (u === E2E.clienteUser) {
      await db
        .insert(obraAcesso)
        .values({ usuarioId: id, obraId: obraIds[E2E.obras.a1.codigo]!, empresaId: E2E.empresa.id })
        .onConflictDoNothing();
    }
  }

  await getPool().end();

  // Aquece as rotas (compilação do dev server) para os testes não pagarem esse custo em paralelo.
  const base = "http://localhost:3000";
  for (const rota of ["/login", "/dashboard", "/obras", "/admin/empresas", "/api/auth/get-session", "/api/health"]) {
    await fetch(base + rota, { redirect: "manual" }).catch(() => undefined);
  }
}
