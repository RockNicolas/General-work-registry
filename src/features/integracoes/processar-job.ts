import { eq, isNotNull } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { getDb } from "@/server/db/client";
import { integracao, sincronizacao } from "@/server/db/schema";
import { FILA_SYNC_ERP } from "@/server/queue/boss";
import type { JobSync } from "./fila";
import { type AmbienteSync, type ResultadoSync, executarSincronizacao } from "./sync";

export type ResultadoJob = ResultadoSync | { executada: false; motivo: string };

/**
 * Trata um job da fila (lado do worker). Jobs de agendamento e de webhook não trazem a linha de
 * execução: ela é criada aqui. Falhas DA SINCRONIZAÇÃO ficam registradas na linha (não viram
 * exceção); só erros inesperados de infraestrutura propagam, para o pg-boss marcar o job como falho.
 */
export async function processarJobSync(job: JobSync, amb: AmbienteSync = {}): Promise<ResultadoJob> {
  const db = getDb();
  const [integ] = await db.select({ id: integracao.id, empresaId: integracao.empresaId, status: integracao.status }).from(integracao).where(eq(integracao.id, job.integracaoId));
  if (!integ) return { executada: false, motivo: "Integração removida; job ignorado." };

  let execucaoId = job.sincronizacaoId;
  if (!execucaoId) {
    // Disparos automáticos respeitam a pausa; o botão manual (que traz o id) já foi validado na tela.
    if (integ.status === "pausada") return { executada: false, motivo: "Integração pausada; disparo automático ignorado." };
    const [criada] = await db
      .insert(sincronizacao)
      .values({ empresaId: integ.empresaId, integracaoId: integ.id, gatilho: job.gatilho, escopo: { tipo: job.tipo ?? "incremental" } })
      .returning({ id: sincronizacao.id });
    execucaoId = criada!.id;
  }
  return executarSincronizacao(execucaoId, amb);
}

/**
 * Alinha os agendamentos do pg-boss com o cadastro: cria/atualiza os das integrações com cron e
 * remove os de integrações sem cron ou excluídas. Roda ao subir o worker.
 */
export async function reconciliarAgendamentos(boss: PgBoss): Promise<{ agendadas: number; removidas: number }> {
  const comCron = await getDb()
    .select({ id: integracao.id, cron: integracao.agendamentoCron })
    .from(integracao)
    .where(isNotNull(integracao.agendamentoCron));
  const desejadas = new Map(comCron.map((i) => [i.id, i.cron!]));

  const existentes = await boss.getSchedules(FILA_SYNC_ERP);
  let removidas = 0;
  for (const s of existentes) {
    if (!desejadas.has(s.key)) {
      await boss.unschedule(FILA_SYNC_ERP, s.key);
      removidas++;
    }
  }
  for (const [id, cron] of desejadas) {
    const job: JobSync = { integracaoId: id, gatilho: "agendada", tipo: "incremental" };
    await boss.schedule(FILA_SYNC_ERP, cron, job, { key: id, tz: "UTC", singletonKey: id });
  }
  return { agendadas: desejadas.size, removidas };
}
