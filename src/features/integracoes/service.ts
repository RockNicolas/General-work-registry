import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { registrarAuditoria } from "@/features/auditoria/registrar";
import type { AppContext } from "@/features/auth/context";
import { podeOperarEmpresa } from "@/features/auth/policies";
import { ActionError } from "@/lib/action-result";
import type { Erp, IntegracaoStatus, SyncGatilho, SyncStatus } from "@/lib/domain";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { integracao, integracaoObra, lancamento, obra, organization, sincronizacao } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { AGENDAMENTOS, type ConfigIntegracao, lerConfig } from "./config";
import { criptografar, descriptografar, gerarSegredoWebhook, hashSegredo, segredoConfere } from "./crypto";
import { type FabricaAdapter, criarAdapter } from "./erp/registro";
import { type ObraErp } from "./erp/tipos";
import { enviarJobSync } from "./fila";
import type { AtualizarIntegracaoInput, CriarIntegracaoInput } from "./schema";
import { mensagemDeErro } from "./sienge/adapter";

const ROTULO_ERP: Record<Erp, string> = { sienge: "Sienge", uau: "UAU (Senior)", lumia: "Lumia" };
/** Só o Sienge tem adaptador funcional por enquanto. */
const ERPS_SINCRONIZAVEIS: Erp[] = ["sienge"];

export type IntegracaoRow = {
  id: string;
  empresaId: string;
  empresaNome: string;
  erp: Erp;
  nome: string;
  endereco: string;
  status: IntegracaoStatus;
  ultimaSyncEm: string | null;
  ultimoErro: string | null;
  agendamento: string;
  cron: string | null;
  config: ConfigIntegracao;
  /** O webhook está ligado (há segredo gerado). */
  webhookAtivo: boolean;
  ultimaExecucao: { status: SyncStatus; lidos: number; gravados: number; erros: number; em: string } | null;
  totalVinculos: number;
};

const agendamentoDe = (cron: string | null) => AGENDAMENTOS.find((a) => a.cron === cron)?.value ?? "manual";
const cronDe = (agendamento: string) => AGENDAMENTOS.find((a) => a.value === agendamento)?.cron ?? null;

const mascarar = (usuario: string) => (usuario.length <= 2 ? `${usuario[0] ?? ""}•••` : `${usuario.slice(0, 2)}${"•".repeat(Math.min(6, usuario.length - 2))}`);

export const urlDoWebhook = (erp: Erp, id: string) => `${getEnv().BETTER_AUTH_URL.replace(/\/$/, "")}/api/webhooks/${erp}/${id}`;

/** Config final: o que a tela edita + o que ela não toca (ex.: eventos do webhook). */
function montarConfig(entrada: AtualizarIntegracaoInput | CriarIntegracaoInput, atual: ConfigIntegracao | null): ConfigIntegracao {
  return lerConfig({
    ...(atual ?? {}),
    indexadorCorrecaoId: entrada.indexadorCorrecaoId ?? undefined,
    mesesHistorico: entrada.mesesHistorico,
    mesesReprocessar: entrada.mesesReprocessar,
    mesesFuturos: entrada.mesesFuturos,
    valorPagamento: entrada.valorPagamento,
    escalaPercentual: entrada.escalaPercentual,
    sincronizarOrcamento: entrada.sincronizarOrcamento,
    sincronizarAvanco: entrada.sincronizarAvanco,
  });
}

const colunas = {
  id: integracao.id,
  empresaId: integracao.empresaId,
  empresaNome: organization.name,
  erp: integracao.erp,
  nome: integracao.nome,
  endereco: integracao.endereco,
  status: integracao.status,
  ultimaSyncEm: integracao.ultimaSyncEm,
  ultimoErro: integracao.ultimoErro,
  cron: integracao.agendamentoCron,
  config: integracao.config,
  webhookHash: integracao.webhookSecretHash,
};

type Tx = Parameters<Parameters<typeof withScope>[1]>[0];

async function paraRow(tx: Tx, r: Awaited<ReturnType<typeof consultar>>[number]): Promise<IntegracaoRow> {
  const [ultima] = await tx
    .select({ status: sincronizacao.status, lidos: sincronizacao.lidos, gravados: sincronizacao.gravados, erros: sincronizacao.erros, em: sincronizacao.createdAt })
    .from(sincronizacao)
    .where(eq(sincronizacao.integracaoId, r.id))
    .orderBy(desc(sincronizacao.createdAt))
    .limit(1);
  const [vinculos] = await tx.select({ n: count() }).from(integracaoObra).where(eq(integracaoObra.integracaoId, r.id));
  const { webhookHash, ...resto } = r;
  return {
    ...resto,
    ultimaSyncEm: r.ultimaSyncEm?.toISOString() ?? null,
    agendamento: agendamentoDe(r.cron),
    config: lerConfig(r.config),
    webhookAtivo: webhookHash !== null,
    ultimaExecucao: ultima ? { ...ultima, em: ultima.em.toISOString() } : null,
    totalVinculos: vinculos?.n ?? 0,
  };
}

const consultar = (tx: Tx, id?: string) => {
  const q = tx.select(colunas).from(integracao).innerJoin(organization, eq(organization.id, integracao.empresaId)).orderBy(asc(organization.name), asc(integracao.nome));
  return id ? q.where(eq(integracao.id, id)) : q;
};

export async function listarIntegracoes(ctx: AppContext): Promise<IntegracaoRow[]> {
  return withScope(ctx, async (tx) => {
    const rows = await consultar(tx);
    const resultado: IntegracaoRow[] = [];
    for (const r of rows) resultado.push(await paraRow(tx, r));
    return resultado;
  });
}

export type VinculoRow = { idOrigem: string; obraId: string; obraCodigo: string; obraNome: string };
export type ExecucaoRow = {
  id: string;
  gatilho: SyncGatilho;
  status: SyncStatus;
  escopo: unknown;
  iniciadaEm: string | null;
  finalizadaEm: string | null;
  lidos: number;
  gravados: number;
  ignorados: number;
  erros: number;
  log: { em: string; nivel: "info" | "aviso" | "erro"; msg: string }[];
  criadaEm: string;
};

export type DetalheIntegracao = IntegracaoRow & {
  usuarioAtual: string;
  vinculos: VinculoRow[];
  execucoes: ExecucaoRow[];
  urlWebhook: string;
  sincronizavel: boolean;
};

export async function obterIntegracao(ctx: AppContext, id: string): Promise<DetalheIntegracao | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return withScope(ctx, async (tx) => {
    const [r] = await consultar(tx, id);
    if (!r) return null;
    const row = await paraRow(tx, r);

    const [cred] = await tx.select({ enc: integracao.credenciaisEnc }).from(integracao).where(eq(integracao.id, id));
    let usuarioAtual = "";
    try {
      if (cred?.enc) usuarioAtual = mascarar((JSON.parse(descriptografar(cred.enc, `integracao:${id}`)) as { usuario: string }).usuario);
    } catch {
      usuarioAtual = "(não foi possível ler)";
    }

    const vinculos = await tx
      .select({ idOrigem: integracaoObra.idOrigem, obraId: integracaoObra.obraId, obraCodigo: obra.codigo, obraNome: obra.nome })
      .from(integracaoObra)
      .innerJoin(obra, eq(obra.id, integracaoObra.obraId))
      .where(eq(integracaoObra.integracaoId, id))
      .orderBy(asc(obra.codigo));
    const execucoes = await tx.select().from(sincronizacao).where(eq(sincronizacao.integracaoId, id)).orderBy(desc(sincronizacao.createdAt)).limit(20);

    return {
      ...row,
      usuarioAtual,
      vinculos,
      execucoes: execucoes.map((e) => ({
        id: e.id,
        gatilho: e.gatilho,
        status: e.status,
        escopo: e.escopo,
        iniciadaEm: e.iniciadaEm?.toISOString() ?? null,
        finalizadaEm: e.finalizadaEm?.toISOString() ?? null,
        lidos: e.lidos,
        gravados: e.gravados,
        ignorados: e.ignorados,
        erros: e.erros,
        log: (e.log as ExecucaoRow["log"]) ?? [],
        criadaEm: e.createdAt.toISOString(),
      })),
      urlWebhook: urlDoWebhook(row.erp, id),
      sincronizavel: ERPS_SINCRONIZAVEIS.includes(row.erp),
    };
  });
}

// ---------- Cadastro ----------

export async function criarIntegracao(ctx: AppContext, input: CriarIntegracaoInput): Promise<{ id: string; cron: string | null }> {
  const id = crypto.randomUUID();
  const credenciais = criptografar(JSON.stringify({ usuario: input.usuario, senha: input.senha }), `integracao:${id}`);
  const cron = cronDe(input.agendamento);

  if (!podeOperarEmpresa(ctx, input.empresaId)) {
    throw new ActionError("Empresa não encontrada.", { empresaId: "Empresa inválida" });
  }

  await withScope(ctx, async (tx) => {
    const [empresa] = await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, input.empresaId));
    if (!empresa) throw new ActionError("Empresa não encontrada.", { empresaId: "Empresa inválida" });

    await tx.insert(integracao).values({
      id,
      empresaId: input.empresaId,
      erp: input.erp,
      nome: input.nome,
      endereco: input.endereco,
      credenciaisEnc: credenciais.valor,
      chaveVersao: credenciais.versao,
      status: "pausada", // vira "ativa" depois de um teste de conexão bem-sucedido
      agendamentoCron: cron,
      config: montarConfig(input, null),
    });
    await registrarAuditoria(tx, ctx, {
      acao: "criar",
      entidade: "integracao",
      entidadeId: id,
      empresaId: input.empresaId,
      resumo: `Integração criada: ${input.nome} (${ROTULO_ERP[input.erp]})`,
      depois: { erp: input.erp, nome: input.nome, endereco: input.endereco, agendamento: input.agendamento },
    });
  });
  return { id, cron };
}

export async function atualizarIntegracao(ctx: AppContext, id: string, input: AtualizarIntegracaoInput): Promise<{ cron: string | null; status: IntegracaoStatus }> {
  const cron = cronDe(input.agendamento);
  return withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(integracao).where(eq(integracao.id, id));
    if (!antes) throw new ActionError("Integração não encontrada.");
    if (antes.erp !== input.erp || antes.empresaId !== input.empresaId) {
      throw new ActionError("O ERP e a empresa de uma integração não podem ser alterados. Crie outra integração.");
    }

    // Credenciais só contam como alteradas se o valor informado for DIFERENTE do atual
    // (reenviar o mesmo usuário/senha não deve pausar a integração).
    let credenciaisEnc = antes.credenciaisEnc;
    let credenciaisMudaram = false;
    if (input.usuario !== "" || input.senha !== "") {
      const atuais = JSON.parse(descriptografar(antes.credenciaisEnc ?? "", `integracao:${id}`)) as { usuario: string; senha: string };
      const novas = { usuario: input.usuario || atuais.usuario, senha: input.senha || atuais.senha };
      if (novas.usuario !== atuais.usuario || novas.senha !== atuais.senha) {
        credenciaisMudaram = true;
        credenciaisEnc = criptografar(JSON.stringify(novas), `integracao:${id}`).valor;
      }
    }
    const mudouAcesso = antes.endereco !== input.endereco || credenciaisMudaram;

    // Mudou endereço/credenciais: volta a "pausada" até testar de novo.
    const status: IntegracaoStatus = mudouAcesso ? "pausada" : antes.status;
    await tx
      .update(integracao)
      .set({ nome: input.nome, endereco: input.endereco, credenciaisEnc, agendamentoCron: cron, config: montarConfig(input, lerConfig(antes.config)), status })
      .where(eq(integracao.id, id));

    await registrarAuditoria(tx, ctx, {
      acao: "editar",
      entidade: "integracao",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: `Integração editada: ${input.nome}${mudouAcesso ? " (credenciais/endereço alterados)" : ""}`,
      antes: { nome: antes.nome, endereco: antes.endereco, cron: antes.agendamentoCron, config: antes.config },
      depois: { nome: input.nome, endereco: input.endereco, cron, config: montarConfig(input, lerConfig(antes.config)) },
    });
    return { cron, status };
  });
}

export async function excluirIntegracao(ctx: AppContext, id: string): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [antes] = await tx.select().from(integracao).where(eq(integracao.id, id));
    if (!antes) throw new ActionError("Integração não encontrada.");
    const [usados] = await tx.select({ n: count() }).from(lancamento).where(eq(lancamento.integracaoId, id));
    if ((usados?.n ?? 0) > 0) {
      throw new ActionError(`Esta integração gravou ${usados!.n} lançamento(s). Para preservar o histórico, pause-a (remova o agendamento) em vez de excluir.`);
    }
    await tx.delete(integracao).where(eq(integracao.id, id)); // cascata: vínculos e execuções
    await registrarAuditoria(tx, ctx, {
      acao: "excluir",
      entidade: "integracao",
      entidadeId: id,
      empresaId: antes.empresaId,
      resumo: `Integração excluída: ${antes.nome}`,
      antes: { nome: antes.nome, erp: antes.erp },
    });
  });
}

// ---------- Conexão e obras do ERP ----------

type AdapterDe = { fabrica?: FabricaAdapter; permitirCustom?: boolean };

async function adapterDaIntegracao(ctx: AppContext, id: string, amb: AdapterDe) {
  const [integ] = await withScope(ctx, (tx) => tx.select().from(integracao).where(eq(integracao.id, id)));
  if (!integ) throw new ActionError("Integração não encontrada.");
  let credenciais: { usuario: string; senha: string };
  try {
    credenciais = JSON.parse(descriptografar(integ.credenciaisEnc ?? "", `integracao:${id}`));
  } catch (e) {
    throw new ActionError(e instanceof Error && /ENCRYPTION_KEY/.test(e.message) ? e.message : "Não foi possível ler as credenciais salvas. Informe usuário e senha novamente (edite a integração).");
  }
  const adapter = (amb.fabrica ?? criarAdapter)(
    { erp: integ.erp, endereco: integ.endereco, credenciais, config: lerConfig(integ.config) },
    { permitirCustom: amb.permitirCustom ?? getEnv().ERP_ALLOW_CUSTOM_BASE_URL },
  );
  return { integ, adapter };
}

/** Testa as credenciais no ERP e atualiza o status da integração. */
export async function testarConexaoIntegracao(ctx: AppContext, id: string, amb: AdapterDe = {}): Promise<{ ok: boolean; mensagem: string }> {
  const { integ, adapter } = await adapterDaIntegracao(ctx, id, amb);
  const r = await adapter.testarConexao();
  const naoImplementado = !ERPS_SINCRONIZAVEIS.includes(integ.erp);

  await withScope(ctx, async (tx) => {
    await tx
      .update(integracao)
      .set(r.ok ? { status: "ativa", ultimoErro: null } : { status: naoImplementado ? "pausada" : "erro", ultimoErro: r.erro.slice(0, 500) })
      .where(eq(integracao.id, id));
    await registrarAuditoria(tx, ctx, {
      acao: "editar",
      entidade: "integracao",
      entidadeId: id,
      empresaId: integ.empresaId,
      resumo: `Teste de conexão: ${r.ok ? "sucesso" : "falhou"} — ${integ.nome}`,
    });
  });
  return r.ok ? { ok: true, mensagem: r.detalhe } : { ok: false, mensagem: r.erro };
}

export type ObraDoErp = ObraErp & { vinculadaA: string | null };

/** Obras/empreendimentos do ERP, marcando quais já estão vinculadas a uma obra do RGO. */
export async function listarObrasDoErp(ctx: AppContext, id: string, amb: AdapterDe = {}): Promise<ObraDoErp[]> {
  const { adapter } = await adapterDaIntegracao(ctx, id, amb);
  let obras: ObraErp[];
  try {
    obras = await adapter.listarObras();
  } catch (e) {
    throw new ActionError(mensagemDeErro(e));
  }
  const vinculos = await withScope(ctx, (tx) => tx.select({ idOrigem: integracaoObra.idOrigem, obraId: integracaoObra.obraId }).from(integracaoObra).where(eq(integracaoObra.integracaoId, id)));
  const porOrigem = new Map(vinculos.map((v) => [v.idOrigem, v.obraId]));
  return obras.map((o) => ({ ...o, vinculadaA: porOrigem.get(o.idOrigem) ?? null }));
}

/** Define TODOS os vínculos da integração (substitui os atuais). Idempotente. */
export async function salvarVinculos(ctx: AppContext, integracaoId: string, vinculos: { idOrigem: string; obraId: string }[]): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [integ] = await tx.select().from(integracao).where(eq(integracao.id, integracaoId));
    if (!integ) throw new ActionError("Integração não encontrada.");

    if (vinculos.length > 0) {
      const obras = await tx.select({ id: obra.id }).from(obra).where(and(eq(obra.empresaId, integ.empresaId), inArray(obra.id, vinculos.map((v) => v.obraId))));
      if (obras.length !== new Set(vinculos.map((v) => v.obraId)).size) throw new ActionError("Uma das obras não pertence à empresa da integração.");
    }
    await tx.delete(integracaoObra).where(eq(integracaoObra.integracaoId, integracaoId));
    if (vinculos.length > 0) {
      await tx.insert(integracaoObra).values(vinculos.map((v) => ({ empresaId: integ.empresaId, integracaoId, obraId: v.obraId, idOrigem: v.idOrigem })));
    }
    await registrarAuditoria(tx, ctx, {
      acao: "editar",
      entidade: "integracao",
      entidadeId: integracaoId,
      empresaId: integ.empresaId,
      resumo: `Vínculos de obras atualizados (${vinculos.length}) — ${integ.nome}`,
      depois: vinculos,
    });
  });
}

/** Cria obras no RGO a partir de empreendimentos do ERP e já as vincula. */
export async function criarObrasDoErp(ctx: AppContext, integracaoId: string, obras: { idOrigem: string; nome: string }[]): Promise<{ criadas: number }> {
  return withScope(ctx, async (tx) => {
    const [integ] = await tx.select().from(integracao).where(eq(integracao.id, integracaoId));
    if (!integ) throw new ActionError("Integração não encontrada.");
    const jaVinculadas = new Set((await tx.select({ id: integracaoObra.idOrigem }).from(integracaoObra).where(eq(integracaoObra.integracaoId, integracaoId))).map((v) => v.id));

    let criadas = 0;
    for (const o of obras) {
      if (jaVinculadas.has(o.idOrigem)) continue;
      // Código = código do ERP; se já existir (ex.: obra criada à mão), acrescenta um sufixo.
      let codigo = o.idOrigem;
      for (let n = 2; (await tx.select({ id: obra.id }).from(obra).where(and(eq(obra.empresaId, integ.empresaId), eq(obra.codigo, codigo)))).length > 0; n++) codigo = `${o.idOrigem}-${n}`;

      const [nova] = await tx.insert(obra).values({ empresaId: integ.empresaId, codigo, nome: o.nome.slice(0, 160), status: "ativa" }).returning({ id: obra.id });
      await tx.insert(integracaoObra).values({ empresaId: integ.empresaId, integracaoId, obraId: nova!.id, idOrigem: o.idOrigem });
      criadas++;
    }
    await registrarAuditoria(tx, ctx, {
      acao: "criar",
      entidade: "obra",
      empresaId: integ.empresaId,
      resumo: `${criadas} obra(s) criada(s) a partir do ERP — ${integ.nome}`,
      depois: obras.map((o) => o.idOrigem),
    });
    return { criadas };
  });
}

// ---------- Sincronização ----------

/** Cria a linha de execução e enfileira o job. Recusa se já houver uma em andamento/na fila. */
export async function solicitarSincronizacao(ctx: AppContext, integracaoId: string, tipo: "incremental" | "historica"): Promise<{ sincronizacaoId: string }> {
  const gatilho: SyncGatilho = tipo === "historica" ? "carga_historica" : "manual";

  const sincronizacaoId = await withScope(ctx, async (tx) => {
    const [integ] = await tx.select().from(integracao).where(eq(integracao.id, integracaoId));
    if (!integ) throw new ActionError("Integração não encontrada.");
    if (!ERPS_SINCRONIZAVEIS.includes(integ.erp)) throw new ActionError(`A sincronização com ${ROTULO_ERP[integ.erp]} ainda não está disponível: aguardando a documentação da API.`);
    if (integ.status === "pausada") throw new ActionError("Teste a conexão antes de sincronizar (a integração está pausada).");

    const [vinculos] = await tx.select({ n: count() }).from(integracaoObra).where(eq(integracaoObra.integracaoId, integracaoId));
    if ((vinculos?.n ?? 0) === 0) throw new ActionError("Vincule ao menos uma obra do ERP a uma obra do RGO antes de sincronizar.");

    // Execuções "presas" há horas não bloqueiam (o worker reassume ou o registro fica como histórico).
    const [emAndamento] = await tx
      .select({ id: sincronizacao.id })
      .from(sincronizacao)
      .where(and(eq(sincronizacao.integracaoId, integracaoId), inArray(sincronizacao.status, ["enfileirada", "executando"]), sql`${sincronizacao.createdAt} > now() - interval '3 hours'`))
      .limit(1);
    if (emAndamento) throw new ActionError("Já existe uma sincronização desta integração na fila ou em andamento. Aguarde terminar.");

    const [criada] = await tx.insert(sincronizacao).values({ empresaId: integ.empresaId, integracaoId, gatilho, escopo: { tipo } }).returning({ id: sincronizacao.id });
    await registrarAuditoria(tx, ctx, {
      acao: "sincronizar",
      entidade: "integracao",
      entidadeId: integracaoId,
      empresaId: integ.empresaId,
      resumo: `Sincronização ${tipo === "historica" ? "histórica" : "manual"} solicitada — ${integ.nome}`,
    });
    return criada!.id;
  });

  try {
    const jobId = await enviarJobSync({ integracaoId, gatilho, sincronizacaoId, tipo });
    if (jobId === null) throw new ActionError("Já existe uma sincronização desta integração na fila. Aguarde terminar.");
  } catch (e) {
    await withScope(ctx, (tx) =>
      tx
        .update(sincronizacao)
        .set({ status: "falhou", finalizadaEm: new Date(), log: [{ em: new Date().toISOString(), nivel: "erro", msg: e instanceof ActionError ? e.message : "Não foi possível enfileirar a sincronização." }] })
        .where(eq(sincronizacao.id, sincronizacaoId)),
    ).catch(() => undefined);
    throw e instanceof ActionError ? e : new ActionError("Não foi possível enfileirar a sincronização (a fila não respondeu). Tente novamente.");
  }
  return { sincronizacaoId };
}

// ---------- Webhook ----------

/** Gera um novo segredo para o webhook. O valor em texto só existe aqui: guardamos apenas o hash. */
export async function gerarSegredoDoWebhook(ctx: AppContext, id: string): Promise<{ segredo: string; url: string }> {
  const segredo = gerarSegredoWebhook();
  const erp = await withScope(ctx, async (tx) => {
    const [integ] = await tx.select().from(integracao).where(eq(integracao.id, id));
    if (!integ) throw new ActionError("Integração não encontrada.");
    await tx.update(integracao).set({ webhookSecretHash: hashSegredo(segredo) }).where(eq(integracao.id, id));
    await registrarAuditoria(tx, ctx, { acao: "editar", entidade: "integracao", entidadeId: id, empresaId: integ.empresaId, resumo: `Segredo do webhook gerado — ${integ.nome}` });
    return integ.erp;
  });
  return { segredo, url: urlDoWebhook(erp, id) };
}

export async function desativarWebhook(ctx: AppContext, id: string): Promise<void> {
  await withScope(ctx, async (tx) => {
    const [integ] = await tx.select().from(integracao).where(eq(integracao.id, id));
    if (!integ) throw new ActionError("Integração não encontrada.");
    await tx.update(integracao).set({ webhookSecretHash: null }).where(eq(integracao.id, id));
    await registrarAuditoria(tx, ctx, { acao: "editar", entidade: "integracao", entidadeId: id, empresaId: integ.empresaId, resumo: `Webhook desativado — ${integ.nome}` });
  });
}

/** Gera um segredo novo e o cadastra no ERP (Sienge: POST /hooks) junto com a URL e os eventos. */
export async function registrarWebhookNoErp(ctx: AppContext, id: string, eventos: string[], amb: AdapterDe = {}): Promise<{ url: string; hookId: string }> {
  const { integ, adapter } = await adapterDaIntegracao(ctx, id, amb);
  if (!adapter.registrarWebhook) throw new ActionError(`O registro automático de webhook não está disponível para ${ROTULO_ERP[integ.erp]}.`);
  const url = urlDoWebhook(integ.erp, id);
  const segredo = gerarSegredoWebhook();

  let hook: { id: string };
  try {
    hook = await adapter.registrarWebhook({ url, token: segredo, eventos });
  } catch (e) {
    throw new ActionError(mensagemDeErro(e));
  }
  await withScope(ctx, async (tx) => {
    await tx.update(integracao).set({ webhookSecretHash: hashSegredo(segredo), config: { ...lerConfig(integ.config), eventosWebhook: eventos } }).where(eq(integracao.id, id));
    await registrarAuditoria(tx, ctx, { acao: "editar", entidade: "integracao", entidadeId: id, empresaId: integ.empresaId, resumo: `Webhook registrado no ERP (${eventos.length} evento(s)) — ${integ.nome}`, depois: { eventos, hookId: hook.id } });
  });
  return { url, hookId: hook.id };
}

/**
 * Autentica uma chamada de webhook: Bearer <segredo> confere com o hash da integração.
 * Roda SEM sessão de usuário (é o ERP chamando), por isso usa a conexão do sistema e devolve o
 * mínimo. Resposta igual para integração inexistente e segredo errado (não revela ids válidos).
 */
export async function autenticarWebhook(integracaoId: string, token: string | null, erpEsperado: Erp): Promise<{ id: string; status: IntegracaoStatus } | null> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(integracaoId)) return null;
  const [integ] = await getDb().select({ id: integracao.id, erp: integracao.erp, status: integracao.status, hash: integracao.webhookSecretHash }).from(integracao).where(eq(integracao.id, integracaoId));
  if (!integ || integ.erp !== erpEsperado || !segredoConfere(token, integ.hash)) return null;
  return { id: integ.id, status: integ.status };
}
