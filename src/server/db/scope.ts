import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { type Database, getDb, getPool } from "./client";
import * as schema from "./schema";

/**
 * Escopo de acesso de uma requisição. É traduzido em variáveis de transação (app.*) lidas pelas
 * políticas de RLS (ver drizzle/0002_rls_tenant.sql).
 */
export type TenantScope = {
  isAdmin: boolean;
  /** Empresas em que o usuário tem papel "empresa" (vê a empresa inteira). */
  empresaIds: readonly string[];
  /** Todas as empresas de que o usuário é membro (papel "empresa" ou "cliente"). */
  membroEmpresaIds: readonly string[];
  /** Obras liberadas individualmente (papel "cliente"). */
  obraIds: readonly string[];
};

export type { Database };
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

function joinIds(ids: readonly string[]): string {
  for (const id of ids) {
    // Os ids vão numa lista separada por vírgula; um id com vírgula quebraria o isolamento.
    if (id.includes(",") || id.length === 0) {
      throw new Error("Id inválido no escopo de acesso");
    }
  }
  return ids.join(",");
}

type ValoresEscopo = {
  isAdmin: string;
  empresaIds: string;
  membroEmpresaIds: string;
  obraIds: string;
};

function valoresDoEscopo(scope: TenantScope): ValoresEscopo {
  return {
    isAdmin: scope.isAdmin ? "true" : "false",
    empresaIds: joinIds(scope.empresaIds),
    membroEmpresaIds: joinIds(scope.membroEmpresaIds),
    obraIds: joinIds(scope.obraIds),
  };
}

/**
 * O banco está longe. BEGIN, o papel e a primeira consulta saem juntos (uma ida);
 * o COMMIT fecha a transação e desfaz o SET LOCAL, então a conexão volta limpa ao pool.
 */
async function executar<T>(client: PoolClient, fn: (tx: Tx) => Promise<T>, valores: ValoresEscopo): Promise<T> {
  const anterior = client.pipeline;
  client.pipeline = true;
  let erroInicial: unknown;
  const ignorar = (error: unknown) => {
    erroInicial ??= error;
  };
  const inicio = Promise.all([
    client.query("BEGIN").then(() => undefined, ignorar),
    client
      .query(
        `select set_config('app.is_admin', $1, true),
                set_config('app.empresa_ids', $2, true),
                set_config('app.membro_empresa_ids', $3, true),
                set_config('app.obra_ids', $4, true),
                set_config('role', 'rgo_app', true)`,
        [valores.isAdmin, valores.empresaIds, valores.membroEmpresaIds, valores.obraIds],
      )
      .then(() => undefined, ignorar),
  ]);
  const db = drizzle({ client, schema });
  let quebrar = false;
  try {
    const result = await fn(db as unknown as Tx);
    await inicio;
    if (erroInicial) throw erroInicial;
    await client.query("COMMIT");
    return result;
  } catch (error) {
    quebrar = true;
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.pipeline = anterior;
    client.release(quebrar);
  }
}

/** Caminho usado quando o chamador injeta um banco (testes). */
async function comTransacaoClassica<T>(fn: (tx: Tx) => Promise<T>, db: Database, valores: ValoresEscopo): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('app.is_admin', ${valores.isAdmin}, true),
      set_config('app.empresa_ids', ${valores.empresaIds}, true),
      set_config('app.membro_empresa_ids', ${valores.membroEmpresaIds}, true),
      set_config('app.obra_ids', ${valores.obraIds}, true),
      set_config('role', 'rgo_app', true)`);
    return fn(tx);
  });
}

/**
 * ÚNICA porta de entrada para consultar tabelas de domínio. Assume o papel `rgo_app`
 * (sujeito a RLS) e injeta o escopo do usuário. Sem escopo, o banco nega tudo.
 *
 * Mesmo com RLS, as consultas devem filtrar por empresa/obra explicitamente: o RLS é a rede
 * de segurança contra esquecimento, não a regra de negócio.
 */
export async function withScope<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>, db?: Database): Promise<T> {
  const valores = valoresDoEscopo(scope);
  if (db) return comTransacaoClassica(fn, db, valores);
  const client = await getPool().connect();
  return executar(client, fn, valores);
}
