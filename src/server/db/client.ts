import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/server/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

// Em dev o HMR reavalia o módulo; guardamos o pool no globalThis para não vazar conexões.
const globalForDb = globalThis as unknown as {
  __rgoPool?: Pool;
  __rgoDb?: Database;
};

export function getPool(): Pool {
  if (!globalForDb.__rgoPool) {
    const pool = new Pool({
      connectionString: getEnv().DATABASE_URL,
      max: 16,
      // Folga para o Neon acordar do auto-suspend na primeira conexão.
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", (error) => {
      console.error("[db] erro em conexão ociosa do pool:", error.message);
    });
    globalForDb.__rgoPool = pool;
  }
  return globalForDb.__rgoPool;
}

export function getDb(): Database {
  globalForDb.__rgoDb ??= drizzle({ client: getPool(), schema });
  return globalForDb.__rgoDb;
}
