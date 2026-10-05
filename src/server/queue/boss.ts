import { PgBoss } from "pg-boss";
import { getEnv } from "@/server/env";

/** Fila das sincronizações com ERPs. */
export const FILA_SYNC_ERP = "erp-sync";

/**
 * - stately: no máximo 1 job na fila + 1 em execução por singletonKey (= id da integração). Apertar
 *   "sincronizar" várias vezes não empilha execuções contra o limite de taxa do ERP.
 * - retryLimit 0: falhas já são registradas e tratadas dentro da sincronização; repetir sozinho só
 *   martelaria o ERP.
 * - expireInSeconds 2h: a carga histórica leva minutos (BULK é 20 req/min); o padrão (15 min) mataria.
 */
export const OPCOES_FILA_SYNC: NonNullable<Parameters<PgBoss["createQueue"]>[1]> = {
  policy: "stately",
  retryLimit: 0,
  expireInSeconds: 2 * 60 * 60,
  retentionSeconds: 7 * 24 * 60 * 60,
};

export async function garantirFilas(boss: PgBoss): Promise<void> {
  try {
    await boss.createQueue(FILA_SYNC_ERP, OPCOES_FILA_SYNC);
  } catch {
    // já existe (corrida entre processos): tudo certo
  }
}

const globais = globalThis as unknown as { __rgoBossProdutor?: Promise<PgBoss> };

/**
 * Instância "produtora" usada pelo Next (Server Actions e webhooks): só envia e agenda jobs.
 * Quem EXECUTA os jobs é o processo `worker` (pnpm worker). Guardada no globalThis para sobreviver ao HMR.
 */
export function getBoss(): Promise<PgBoss> {
  globais.__rgoBossProdutor ??= (async () => {
    const boss = new PgBoss({ connectionString: getEnv().DATABASE_URL, supervise: false, schedule: false, max: 3 });
    boss.on("error", (erro) => console.error("[fila] erro no pg-boss:", erro.message));
    await boss.start();
    await garantirFilas(boss);
    return boss;
  })().catch((erro) => {
    globais.__rgoBossProdutor = undefined; // tenta de novo na próxima chamada
    throw erro;
  });
  return globais.__rgoBossProdutor;
}

/** Encerra a instância produtora (testes e shutdown). */
export async function fecharBoss(): Promise<void> {
  const p = globais.__rgoBossProdutor;
  globais.__rgoBossProdutor = undefined;
  if (p) await (await p).stop({ graceful: true, timeout: 5000 }).catch(() => undefined);
}
