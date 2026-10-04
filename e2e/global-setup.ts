import { member, organization } from "../src/server/db/schema";
import { getDb, getPool } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";
import { upsertUsuarioCredencial } from "../src/server/auth-users";
import { E2E } from "./users";

/**
 * Prepara o banco para o e2e: migrations + usuários fixos (um por perfil). Idempotente, então
 * pode rodar repetidas vezes no banco develop sem acumular lixo.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente: o e2e precisa de um Postgres (branch develop).");
  await runMigrations(url);

  const db = getDb();
  await db
    .insert(organization)
    .values({ id: E2E.empresa.id, name: E2E.empresa.nome, slug: E2E.empresa.slug, createdAt: new Date() })
    .onConflictDoNothing();

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
  }

  await getPool().end();

  // Aquece as rotas (compilação do dev server) para os testes não pagarem esse custo em paralelo.
  const base = "http://localhost:3000";
  for (const rota of ["/login", "/dashboard", "/api/auth/get-session", "/api/health"]) {
    await fetch(base + rota, { redirect: "manual" }).catch(() => undefined);
  }
}
