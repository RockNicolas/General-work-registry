import { PgBoss } from "pg-boss";
import type { JobSync } from "@/features/integracoes/fila";
import { processarJobSync, reconciliarAgendamentos } from "@/features/integracoes/processar-job";
import { getEnv } from "@/server/env";
import { FILA_SYNC_ERP, garantirFilas } from "@/server/queue/boss";

/** Quantas sincronizações de ERP rodam ao mesmo tempo neste processo (os limites de taxa são compartilhados). */
const CONCORRENCIA_SYNC = 2;

// Processo separado do Next: consome as filas do pg-boss e dispara os agendamentos.
async function main() {
  const boss = new PgBoss(getEnv().DATABASE_URL);
  boss.on("error", (error) => console.error("[worker] erro no pg-boss:", error));

  await boss.start();
  await garantirFilas(boss);

  await boss.work<JobSync>(FILA_SYNC_ERP, { batchSize: 1, localConcurrency: CONCORRENCIA_SYNC }, async ([job]) => {
    if (!job) return;
    const t0 = Date.now();
    const r = await processarJobSync(job.data);
    const resumo = r.executada ? `${r.status} (${r.lidos} lidos, ${r.gravados} gravados, ${r.erros} problemas)` : `ignorado: ${r.motivo}`;
    console.log(`[worker] sync ${job.data.integracaoId} (${job.data.gatilho}) ${resumo} em ${Math.round((Date.now() - t0) / 1000)}s`);
  });

  const ag = await reconciliarAgendamentos(boss);
  console.log(`[worker] pg-boss iniciado: fila "${FILA_SYNC_ERP}" (concorrência ${CONCORRENCIA_SYNC}); ${ag.agendadas} agendamento(s), ${ag.removidas} removido(s)`);

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} recebido; encerrando`);
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[worker] falha ao iniciar:", error);
  process.exit(1);
});
