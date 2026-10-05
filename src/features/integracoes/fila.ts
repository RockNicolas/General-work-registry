import type { SyncGatilho } from "@/lib/domain";
import { FILA_SYNC_ERP, getBoss } from "@/server/queue/boss";

/** Conteúdo de um job de sincronização. */
export type JobSync = {
  integracaoId: string;
  gatilho: SyncGatilho;
  /** Quando a linha de execução já foi criada (botão manual); senão o worker cria. */
  sincronizacaoId?: string;
  tipo?: "incremental" | "historica";
};

/** Janela mínima entre sincronizações disparadas por webhook (o ERP pode mandar rajadas de eventos). */
export const THROTTLE_WEBHOOK_SEGUNDOS = 60;

/**
 * Enfileira uma sincronização. Devolve o id do job, ou null se já havia uma da mesma integração
 * na fila (política "stately": a nova é descartada em vez de empilhar).
 */
export async function enviarJobSync(job: JobSync): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(FILA_SYNC_ERP, job, { singletonKey: job.integracaoId });
}

/** Webhook: no máximo uma sincronização por janela, por integração. */
export async function enviarJobSyncPorWebhook(integracaoId: string): Promise<string | null> {
  const boss = await getBoss();
  const job: JobSync = { integracaoId, gatilho: "webhook", tipo: "incremental" };
  return boss.sendThrottled(FILA_SYNC_ERP, job, { singletonKey: integracaoId }, THROTTLE_WEBHOOK_SEGUNDOS, integracaoId);
}

/** Cria/atualiza (ou remove, com cron nulo) o agendamento da integração. O cron é em UTC. */
export async function agendarIntegracao(integracaoId: string, cron: string | null): Promise<void> {
  const boss = await getBoss();
  if (!cron) {
    await boss.unschedule(FILA_SYNC_ERP, integracaoId);
    return;
  }
  const job: JobSync = { integracaoId, gatilho: "agendada", tipo: "incremental" };
  await boss.schedule(FILA_SYNC_ERP, cron, job, { key: integracaoId, tz: "UTC", singletonKey: integracaoId });
}
