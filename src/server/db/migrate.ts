import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Aplica as migrations de ./drizzle. Usa conexão própria e curta (não o pool da aplicação). */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 15_000 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
  } finally {
    await pool.end();
  }
}

/** Mensagem útil para erros do pg/drizzle (o `cause` costuma ter o motivo real). */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: unknown }).cause;
  const code = (error as { code?: string }).code;
  const parts = [error.message || code || error.name];
  if (cause instanceof Error && cause.message) parts.push(`causa: ${cause.message}`);
  return parts.join("\n  ");
}
