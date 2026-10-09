import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/server/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

// Em dev o HMR reavalia o módulo; guardamos o pool no globalThis para não vazar conexões.
const globalForDb = globalThis as unknown as {
  __rgoPool?: Pool;
  __rgoDb?: Database;
  __rgoKeepalive?: ReturnType<typeof setInterval>;
};

/** O Neon desliga o compute parado. Um ping mais curto que isso impede o próximo clique de esperar o boot. */
const ACORDAR_MS = 45_000;

function criarPool(): Pool {
  const pool = new Pool({
    connectionString: getEnv().DATABASE_URL,
    max: 12,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // Não solta a sessão TLS quente: abrir outra até Ohio custa bem mais que a consulta.
    idleTimeoutMillis: 0,
    // A primeira conexão acorda o compute. 10 s estourava e a página virava erro de sessão.
    connectionTimeoutMillis: 20_000,
  });
  pool.on("error", (error) => {
    console.error("[db] erro em conexão ociosa do pool:", error.message);
  });
  return pool;
}

function acordar(pool: Pool) {
  pool.query("select 1").catch((error: Error) => {
    console.error("[db] falha ao falar com o banco:", error.message);
  });
}

export function getPool(): Pool {
  if (!globalForDb.__rgoPool) {
    const pool = criarPool();
    globalForDb.__rgoPool = pool;
    acordar(pool);
    const timer = setInterval(() => acordar(pool), ACORDAR_MS);
    timer.unref();
    globalForDb.__rgoKeepalive = timer;
  }
  return globalForDb.__rgoPool;
}

export function getDb(): Database {
  globalForDb.__rgoDb ??= drizzle({ client: getPool(), schema });
  return globalForDb.__rgoDb;
}
