import { sql } from "drizzle-orm";
import { getDb, type Database } from "./client";

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

/**
 * ÚNICA porta de entrada para consultar tabelas de domínio. Abre uma transação, assume o papel
 * `rgo_app` (sujeito a RLS) e injeta o escopo do usuário. Sem escopo, o banco nega tudo.
 *
 * Mesmo com RLS, as consultas devem filtrar por empresa/obra explicitamente: o RLS é a rede
 * de segurança contra esquecimento, não a regra de negócio.
 */
export async function withScope<T>(
  scope: TenantScope,
  fn: (tx: Tx) => Promise<T>,
  db: Database = getDb(),
): Promise<T> {
  const empresaIds = joinIds(scope.empresaIds);
  const membroEmpresaIds = joinIds(scope.membroEmpresaIds);
  const obraIds = joinIds(scope.obraIds);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('app.is_admin', ${scope.isAdmin ? "true" : "false"}, true),
      set_config('app.empresa_ids', ${empresaIds}, true),
      set_config('app.membro_empresa_ids', ${membroEmpresaIds}, true),
      set_config('app.obra_ids', ${obraIds}, true)`);
    await tx.execute(sql`set local role rgo_app`);
    return fn(tx);
  });
}
