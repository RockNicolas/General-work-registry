import { and, eq, inArray } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as webhook } from "@/app/api/webhooks/[erp]/[integracaoId]/route";
import { getDb, getPool } from "@/server/db/client";
import { auditoria, integracao, lancamento, sincronizacao } from "@/server/db/schema";
import { FILA_SYNC_ERP, fecharBoss, garantirFilas, getBoss } from "@/server/queue/boss";
import { CREDENCIAIS_FAKE, type FakeSienge, empreendimento, iniciarFakeSienge, parcelaPagarFake } from "@/test/fake-sienge";
import { createTenantFixture, type TenantFixture } from "@/test/fixtures";
import { agendarIntegracao, enviarJobSync, enviarJobSyncPorWebhook, type JobSync } from "./fila";
import { LimitadorTaxa } from "./erp/rate-limit";
import { processarJobSync, reconciliarAgendamentos } from "./processar-job";
import { criarIntegracao, gerarSegredoDoWebhook, salvarVinculos, solicitarSincronizacao } from "./service";
import type { AmbienteSync } from "./sync";

let fx: TenantFixture;
let fake: FakeSienge;
let worker: PgBoss;
const HOJE = "2026-03-15";

const amb: AmbienteSync = {
  hoje: () => HOJE,
  ambiente: {
    permitirCustom: true,
    http: { baseBackoffMs: 1, maxBackoffMs: 5, timeoutMs: 5000 },
    limitadores: { rest: new LimitadorTaxa(10_000, 6_000_000), bulk: new LimitadorTaxa(10_000, 6_000_000) },
    hoje: () => HOJE,
  },
};

beforeAll(async () => {
  fx = await createTenantFixture();
  fake = await iniciarFakeSienge("demo");
  fake.dados.empreendimentos = [empreendimento(101, "Obra Cem e Um")];
  fake.dados.parcelasPagar = [parcelaPagarFake(1, { billDate: "2026-02-10" })];

  // Worker em processo (o mesmo que `pnpm worker` faz, com o ambiente de teste injetado).
  worker = new PgBoss({ connectionString: process.env.DATABASE_URL!, max: 3 });
  worker.on("error", () => undefined);
  await worker.start();
  await garantirFilas(worker);
  await worker.deleteAllJobs(FILA_SYNC_ERP);
  for (const s of await worker.getSchedules(FILA_SYNC_ERP)) await worker.unschedule(FILA_SYNC_ERP, s.key);
  await worker.work<JobSync>(FILA_SYNC_ERP, { batchSize: 1, pollingIntervalSeconds: 0.5 }, async ([job]) => {
    if (job) await processarJobSync(job.data, amb);
  });
});

afterAll(async () => {
  const db = getDb();
  const empresas = [fx.ids.empresaA, fx.ids.empresaB];
  await worker?.stop({ graceful: true, timeout: 5000 });
  await fecharBoss();
  await db.delete(auditoria).where(inArray(auditoria.empresaId, empresas));
  await db.delete(lancamento).where(inArray(lancamento.empresaId, empresas));
  await db.delete(integracao).where(inArray(integracao.empresaId, empresas));
  await fx?.cleanup();
  await fake?.fechar();
  await getPool().end();
});

const admin = () => fx.ctx.admin;

async function criarAtiva(extra: Record<string, unknown> = {}) {
  const { id } = await criarIntegracao(admin(), {
    empresaId: fx.ids.empresaA, erp: "sienge", nome: `Sienge ${crypto.randomUUID().slice(0, 6)}`, endereco: fake.url,
    usuario: CREDENCIAIS_FAKE.usuario, senha: CREDENCIAIS_FAKE.senha, agendamento: "manual", indexadorCorrecaoId: 1,
    mesesHistorico: 24, mesesReprocessar: 3, mesesFuturos: 6, valorPagamento: "liquido", escalaPercentual: "0-100",
    sincronizarOrcamento: false, sincronizarAvanco: false, ...extra,
  });
  await getDb().update(integracao).set({ status: "ativa" }).where(eq(integracao.id, id));
  await salvarVinculos(admin(), id, [{ idOrigem: "101", obraId: fx.obraId["A-1"] }]);
  return id;
}

/** Espera uma condição assíncrona (com limite), sem dormir mais que o necessário. */
async function esperar<T>(buscar: () => Promise<T | undefined>, ms = 20_000): Promise<T> {
  const limite = Date.now() + ms;
  for (;;) {
    const v = await buscar();
    if (v !== undefined) return v;
    if (Date.now() > limite) throw new Error("Tempo esgotado esperando a condição");
    await new Promise((r) => setTimeout(r, 150));
  }
}

const execucoesDe = (id: string) => getDb().select().from(sincronizacao).where(eq(sincronizacao.integracaoId, id));
const terminada = (id: string) =>
  esperar(async () => {
    const rows = await execucoesDe(id);
    return rows.length > 0 && rows.every((r) => !["enfileirada", "executando"].includes(r.status)) ? rows : undefined;
  });

const chamarWebhook = (id: string, headers: Record<string, string> = {}, erp = "sienge") =>
  webhook(new Request(`http://localhost/api/webhooks/${erp}/${id}`, { method: "POST", headers, body: JSON.stringify({ evento: "BILL_UPDATED" }) }), {
    params: Promise.resolve({ erp, integracaoId: id }),
  } as never);

describe("botão 'sincronizar agora' → fila → worker", () => {
  it("o job entra na fila, o worker executa e os dados do ERP chegam ao banco", async () => {
    const id = await criarAtiva();
    const { sincronizacaoId } = await solicitarSincronizacao(admin(), id, "incremental");

    const [exec] = await terminada(id);
    expect(exec).toMatchObject({ id: sincronizacaoId, status: "concluida", gatilho: "manual", erros: 0 });
    expect(exec!.gravados).toBeGreaterThan(0);
    const rows = await getDb().select().from(lancamento).where(and(eq(lancamento.integracaoId, id), eq(lancamento.origem, "erp")));
    expect(rows.length).toBeGreaterThan(0);
    expect((await getDb().select().from(integracao).where(eq(integracao.id, id)))[0]!.ultimaSyncEm).not.toBeNull();
  });

  it("carga histórica usa o gatilho certo", async () => {
    const id = await criarAtiva();
    await solicitarSincronizacao(admin(), id, "historica");
    const [exec] = await terminada(id);
    expect(exec).toMatchObject({ gatilho: "carga_historica", status: "concluida" });
  });

  it("vários envios do mesmo job não empilham (política stately)", async () => {
    const id = crypto.randomUUID(); // job para integração inexistente: só testa a fila
    const boss = await getBoss();
    await boss.deleteAllJobs(FILA_SYNC_ERP);
    const antes = await Promise.all([1, 2, 3].map(() => enviarJobSync({ integracaoId: id, gatilho: "manual" })));
    expect(antes.filter((x) => x !== null).length).toBeLessThanOrEqual(2); // no máximo 1 na fila + 1 já ativa
    expect(antes.filter((x) => x === null).length).toBeGreaterThanOrEqual(1);
  });
});

describe("webhook do ERP", () => {
  it("recusa sem token, com token errado, com ERP errado e integração inexistente (sempre a mesma resposta)", async () => {
    const id = await criarAtiva();
    const { segredo } = await gerarSegredoDoWebhook(admin(), id);

    for (const [headers, erp, alvo] of [
      [{}, "sienge", id],
      [{ Authorization: "Bearer errado" }, "sienge", id],
      [{ Authorization: segredo }, "sienge", id], // sem o prefixo Bearer
      [{ Authorization: `Bearer ${segredo}` }, "uau", id],
      [{ Authorization: `Bearer ${segredo}` }, "sienge", crypto.randomUUID()],
      [{ Authorization: `Bearer ${segredo}` }, "sienge", "nao-e-uuid"],
    ] as const) {
      const r = await chamarWebhook(alvo, { ...headers }, erp);
      expect(r.status, JSON.stringify([headers, erp])).toBe(401);
      expect(await r.json()).toEqual({ error: "não autorizado" });
    }
  });

  it("evento autenticado dispara uma sincronização incremental; rajada vira uma só", async () => {
    const id = await criarAtiva();
    const { segredo } = await gerarSegredoDoWebhook(admin(), id);
    const headers = { Authorization: `Bearer ${segredo}` };

    const primeira = await chamarWebhook(id, headers);
    expect(primeira.status).toBe(202);
    expect(await primeira.json()).toEqual({ status: "enfileirado" });
    const segunda = await chamarWebhook(id, headers);
    expect(segunda.status).toBe(202);
    expect(await segunda.json()).toEqual({ status: "ja_enfileirado" });

    const rows = await terminada(id);
    expect(rows).toHaveLength(1); // as duas chamadas geraram UMA sincronização
    expect(rows[0]).toMatchObject({ gatilho: "webhook", status: "concluida" });
    expect(rows[0]!.escopo).toEqual({ tipo: "incremental" });
  });

  it("integração pausada: aceita o evento, mas ignora", async () => {
    const id = await criarAtiva();
    const { segredo } = await gerarSegredoDoWebhook(admin(), id);
    await getDb().update(integracao).set({ status: "pausada" }).where(eq(integracao.id, id));
    const r = await chamarWebhook(id, { Authorization: `Bearer ${segredo}` });
    expect(r.status).toBe(202);
    expect(await r.json()).toMatchObject({ status: "ignorado" });
    expect(await execucoesDe(id)).toHaveLength(0);
  });

  it("corpo enorme é recusado", async () => {
    const id = await criarAtiva();
    const { segredo } = await gerarSegredoDoWebhook(admin(), id);
    const r = await webhook(
      new Request(`http://localhost/api/webhooks/sienge/${id}`, { method: "POST", headers: { Authorization: `Bearer ${segredo}` }, body: "x".repeat(70_000) }),
      { params: Promise.resolve({ erp: "sienge", integracaoId: id }) } as never,
    );
    expect(r.status).toBe(413);
  });
});

describe("processarJobSync", () => {
  it("disparo agendado cria a linha de execução e roda", async () => {
    const id = await criarAtiva();
    const r = await processarJobSync({ integracaoId: id, gatilho: "agendada", tipo: "incremental" }, amb);
    expect(r).toMatchObject({ executada: true, status: "concluida" });
    expect((await execucoesDe(id))[0]).toMatchObject({ gatilho: "agendada" });
  });

  it("disparo automático em integração pausada, ou removida, é ignorado", async () => {
    const id = await criarAtiva();
    await getDb().update(integracao).set({ status: "pausada" }).where(eq(integracao.id, id));
    expect(await processarJobSync({ integracaoId: id, gatilho: "agendada" }, amb)).toMatchObject({ executada: false });
    expect(await execucoesDe(id)).toHaveLength(0);
    expect(await processarJobSync({ integracaoId: crypto.randomUUID(), gatilho: "webhook" }, amb)).toMatchObject({ executada: false, motivo: expect.stringContaining("removida") });
  });
});

describe("agendamento (cron)", () => {
  it("agenda e desagenda por integração", async () => {
    const id = await criarAtiva();
    await agendarIntegracao(id, "0 6 * * *");
    const boss = await getBoss();
    expect((await boss.getSchedules(FILA_SYNC_ERP, id))[0]).toMatchObject({ key: id, cron: "0 6 * * *", timezone: "UTC" });
    await agendarIntegracao(id, "0 */6 * * *");
    expect((await boss.getSchedules(FILA_SYNC_ERP, id))[0]!.cron).toBe("0 */6 * * *"); // atualiza, não duplica
    await agendarIntegracao(id, null);
    expect(await boss.getSchedules(FILA_SYNC_ERP, id)).toEqual([]);
  });

  it("ao subir o worker, alinha os agendamentos ao cadastro (cria os que faltam, remove os órfãos)", async () => {
    const comCron = await criarAtiva({ agendamento: "diaria" });
    const semCron = await criarAtiva();
    const boss = await getBoss();
    const orfao = crypto.randomUUID();
    await boss.schedule(FILA_SYNC_ERP, "0 1 * * *", { integracaoId: orfao, gatilho: "agendada" }, { key: orfao, tz: "UTC" });
    await boss.schedule(FILA_SYNC_ERP, "0 2 * * *", { integracaoId: semCron, gatilho: "agendada" }, { key: semCron, tz: "UTC" });

    const r = await reconciliarAgendamentos(worker);
    expect(r.removidas).toBeGreaterThanOrEqual(2);

    const chaves = (await boss.getSchedules(FILA_SYNC_ERP)).map((s) => s.key);
    expect(chaves).toContain(comCron);
    expect(chaves).not.toContain(orfao);
    expect(chaves).not.toContain(semCron);
    expect((await boss.getSchedules(FILA_SYNC_ERP, comCron))[0]!.cron).toBe("0 6 * * *");
  });
});

// O throttle de webhook também protege a fila quando o ERP manda muitos eventos seguidos.
describe("throttle de webhook (direto na fila)", () => {
  it("duas chamadas seguidas: só a primeira cria job", async () => {
    const id = crypto.randomUUID();
    const a = await enviarJobSyncPorWebhook(id);
    const b = await enviarJobSyncPorWebhook(id);
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });
});
