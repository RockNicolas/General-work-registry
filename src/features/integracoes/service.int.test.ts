import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ActionError } from "@/lib/action-result";
import { getDb, getPool } from "@/server/db/client";
import { friendlyDbError } from "@/server/db/errors";
import { fecharBoss } from "@/server/queue/boss";
import { auditoria, integracao, integracaoObra, lancamento, obra, sincronizacao } from "@/server/db/schema";
import { CREDENCIAIS_FAKE, type FakeSienge, empreendimento, iniciarFakeSienge } from "@/test/fake-sienge";
import { createTenantFixture, type TenantFixture } from "@/test/fixtures";
import { descriptografar } from "./crypto";
import { type CriarIntegracaoInput } from "./schema";
import {
  atualizarIntegracao,
  autenticarWebhook,
  criarIntegracao,
  criarObrasDoErp,
  desativarWebhook,
  excluirIntegracao,
  gerarSegredoDoWebhook,
  listarIntegracoes,
  listarObrasDoErp,
  obterIntegracao,
  registrarWebhookNoErp,
  salvarVinculos,
  solicitarSincronizacao,
  testarConexaoIntegracao,
} from "./service";
import { lerConfig } from "./config";

let fx: TenantFixture;
let fake: FakeSienge;

beforeAll(async () => {
  fx = await createTenantFixture();
  fake = await iniciarFakeSienge("demo");
  fake.dados.empreendimentos = [empreendimento(101, "Obra Cem e Um"), empreendimento(102, "Obra Cem e Dois", "2"), empreendimento(103, "Centro de Custo X", "3")];
});

afterAll(async () => {
  const db = getDb();
  const empresas = [fx.ids.empresaA, fx.ids.empresaB];
  await db.delete(auditoria).where(inArray(auditoria.empresaId, empresas));
  await db.delete(lancamento).where(inArray(lancamento.empresaId, empresas));
  await db.delete(integracao).where(inArray(integracao.empresaId, empresas));
  await fx?.cleanup();
  await fake?.fechar();
  await fecharBoss();
  await getPool().end();
});

const admin = () => fx.ctx.admin;
const ambiente = { permitirCustom: true };

const entrada = (extra: Partial<CriarIntegracaoInput> = {}): CriarIntegracaoInput => ({
  empresaId: fx.ids.empresaA,
  erp: "sienge",
  nome: `Sienge ${crypto.randomUUID().slice(0, 6)}`,
  endereco: fake.url, // URL completa: só vale porque o ambiente de teste libera
  usuario: CREDENCIAIS_FAKE.usuario,
  senha: CREDENCIAIS_FAKE.senha,
  agendamento: "manual",
  indexadorCorrecaoId: 1,
  mesesHistorico: 24,
  mesesReprocessar: 3,
  mesesFuturos: 6,
  valorPagamento: "liquido",
  escalaPercentual: "0-100",
  sincronizarOrcamento: true,
  sincronizarAvanco: true,
  ...extra,
});

const criar = async (extra: Partial<CriarIntegracaoInput> = {}) => (await criarIntegracao(admin(), entrada(extra))).id;
const linha = async (id: string) => (await getDb().select().from(integracao).where(eq(integracao.id, id)))[0]!;

describe("cadastro", () => {
  it("guarda as credenciais CRIPTOGRAFADAS (nunca em texto) e começa pausada", async () => {
    const id = await criar();
    const r = await linha(id);
    expect(r).toMatchObject({ status: "pausada", erp: "sienge", empresaId: fx.ids.empresaA });
    expect(r.credenciaisEnc).toMatch(/^v1\./);
    expect(r.credenciaisEnc).not.toContain(CREDENCIAIS_FAKE.senha);
    expect(JSON.stringify(r)).not.toContain(CREDENCIAIS_FAKE.senha);
    expect(JSON.parse(descriptografar(r.credenciaisEnc!, `integracao:${id}`))).toEqual(CREDENCIAIS_FAKE);
    expect(lerConfig(r.config)).toMatchObject({ indexadorCorrecaoId: 1, mesesFuturos: 6 });
  });

  it("os dados lidos para a tela nunca trazem a senha, só o usuário mascarado", async () => {
    const id = await criar();
    const d = (await obterIntegracao(admin(), id))!;
    const texto = JSON.stringify(d);
    expect(texto).not.toContain(CREDENCIAIS_FAKE.senha);
    expect(texto).not.toContain("credenciaisEnc");
    expect(d.usuarioAtual).toMatch(/^ap•+/);
    expect(d.usuarioAtual).not.toBe(CREDENCIAIS_FAKE.usuario);
    expect(d.urlWebhook).toContain(`/api/webhooks/sienge/${id}`);
    const lista = await listarIntegracoes(admin());
    expect(JSON.stringify(lista)).not.toContain(CREDENCIAIS_FAKE.senha);
  });

  it("o texto cifrado não abre em outra integração (AAD)", async () => {
    const a = await criar();
    const b = await criar();
    const ra = await linha(a);
    expect(() => descriptografar(ra.credenciaisEnc!, `integracao:${b}`)).toThrow(/descriptografar/);
  });

  it("nome repetido na mesma empresa dá mensagem amigável", async () => {
    const nome = `Duplicada ${crypto.randomUUID().slice(0, 6)}`;
    await criar({ nome });
    const erro = await criarIntegracao(admin(), entrada({ nome })).catch((e) => e);
    expect(friendlyDbError(erro)).toBe("Já existe uma integração com este nome nesta empresa.");
  });

  it("editar: trocar só a senha mantém o usuário; credenciais em branco mantêm as atuais", async () => {
    const id = await criar();
    const base = entrada();

    await atualizarIntegracao(admin(), id, { ...base, nome: (await linha(id)).nome, usuario: "", senha: "" });
    expect(JSON.parse(descriptografar((await linha(id)).credenciaisEnc!, `integracao:${id}`))).toEqual(CREDENCIAIS_FAKE);

    await atualizarIntegracao(admin(), id, { ...base, nome: (await linha(id)).nome, usuario: "", senha: "NovaSenha!" });
    expect(JSON.parse(descriptografar((await linha(id)).credenciaisEnc!, `integracao:${id}`))).toEqual({ usuario: CREDENCIAIS_FAKE.usuario, senha: "NovaSenha!" });
  });

  it("alterar credenciais ou endereço volta para 'pausada' (exige novo teste); alterar só o nome não", async () => {
    const id = await criar();
    await getDb().update(integracao).set({ status: "ativa" }).where(eq(integracao.id, id));
    const nome = (await linha(id)).nome;

    // Só o nome (credenciais em branco = manter).
    await atualizarIntegracao(admin(), id, { ...entrada({ usuario: "", senha: "" }), nome: `${nome} renomeada` });
    expect((await linha(id)).status).toBe("ativa");

    // Reenviar as MESMAS credenciais também não conta como alteração.
    await atualizarIntegracao(admin(), id, { ...entrada(), nome: `${nome} renomeada` });
    expect((await linha(id)).status).toBe("ativa");

    await atualizarIntegracao(admin(), id, { ...entrada(), nome: `${nome} renomeada`, senha: "outra" });
    expect((await linha(id)).status).toBe("pausada");
  });

  it("não permite trocar ERP nem empresa", async () => {
    const id = await criar();
    const nome = (await linha(id)).nome;
    expect(await atualizarIntegracao(admin(), id, { ...entrada({ empresaId: fx.ids.empresaB }), nome }).catch((e) => e)).toBeInstanceOf(ActionError);
    expect(await atualizarIntegracao(admin(), id, { ...entrada({ erp: "uau" }), nome }).catch((e) => e)).toBeInstanceOf(ActionError);
  });

  it("agendamento vira cron (UTC); 'manual' limpa", async () => {
    const id = await criar({ agendamento: "diaria" });
    expect((await linha(id)).agendamentoCron).toBe("0 6 * * *");
    await atualizarIntegracao(admin(), id, { ...entrada({ agendamento: "manual" }), nome: (await linha(id)).nome });
    expect((await linha(id)).agendamentoCron).toBeNull();
  });

  it("excluir: livre se nada foi sincronizado; bloqueado se há lançamentos", async () => {
    const livre = await criar();
    await excluirIntegracao(admin(), livre);
    expect(await obterIntegracao(admin(), livre)).toBeNull();

    const usada = await criar();
    await getDb().insert(lancamento).values({
      empresaId: fx.ids.empresaA, obraId: fx.obraId["A-1"], categoriaId: fx.categoriaId.A, tipo: "custo", valorCentavos: 100,
      dataCompetencia: "2026-01-01", origem: "erp", integracaoId: usada, idOrigem: "out:1:x",
    });
    const erro = await excluirIntegracao(admin(), usada).catch((e) => e);
    expect(erro).toBeInstanceOf(ActionError);
    expect((erro as Error).message).toMatch(/lançamento\(s\)/);
  });

  it("empresa e cliente nunca veem integrações (RLS), e não conseguem criar", async () => {
    const id = await criar();
    for (const quem of ["empresaA", "clienteA", "empresaB"] as const) {
      expect((await listarIntegracoes(fx.ctx[quem])).filter((i) => i.id === id), quem).toEqual([]);
      expect(await obterIntegracao(fx.ctx[quem], id), quem).toBeNull();
    }
    const erro = await criarIntegracao(fx.ctx.empresaA, entrada()).catch((e) => e);
    expect(friendlyDbError(erro)).toBe("Sem permissão para esta operação.");
  });

  it("a criação e a edição ficam na auditoria, sem credenciais", async () => {
    const id = await criar();
    const eventos = await getDb().select().from(auditoria).where(and(eq(auditoria.entidade, "integracao"), eq(auditoria.entidadeId, id)));
    expect(eventos).toHaveLength(1);
    expect(JSON.stringify(eventos)).not.toContain(CREDENCIAIS_FAKE.senha);
  });
});

describe("conexão com o ERP", () => {
  it("teste bem-sucedido ativa a integração; credencial errada a marca com erro e guarda o motivo", async () => {
    const boa = await criar();
    expect(await testarConexaoIntegracao(admin(), boa, ambiente)).toEqual({ ok: true, mensagem: expect.stringContaining("3 empreendimento(s)") });
    expect(await linha(boa)).toMatchObject({ status: "ativa", ultimoErro: null });

    const ruim = await criar({ senha: "errada" });
    const r = await testarConexaoIntegracao(admin(), ruim, ambiente);
    expect(r).toEqual({ ok: false, mensagem: expect.stringContaining("recusou o usuário/senha") });
    expect(await linha(ruim)).toMatchObject({ status: "erro" });
    expect((await linha(ruim)).ultimoErro).toMatch(/recusou/);
  });

  it("UAU e Lumia: o teste explica que aguardam a documentação e a integração segue 'pausada'", async () => {
    const uau = await criar({ erp: "uau", endereco: "https://uau.exemplo.com.br", indexadorCorrecaoId: null });
    const r = await testarConexaoIntegracao(admin(), uau);
    expect(r).toEqual({ ok: false, mensagem: expect.stringContaining("aguarda a documentação") });
    expect(await linha(uau)).toMatchObject({ status: "pausada" });

    const lumia = await criar({ erp: "lumia", endereco: "qualquer", indexadorCorrecaoId: null });
    expect((await testarConexaoIntegracao(admin(), lumia)).mensagem).toMatch(/ainda não foi implementada/);
  });

  it("lista as obras do ERP e marca as já vinculadas", async () => {
    const id = await criar();
    await salvarVinculos(admin(), id, [{ idOrigem: "101", obraId: fx.obraId["A-1"] }]);
    const obras = await listarObrasDoErp(admin(), id, ambiente);
    expect(obras.map((o) => [o.idOrigem, o.tipo, o.vinculadaA])).toEqual([
      ["101", "Obra e centro de custo", fx.obraId["A-1"]],
      ["102", "Obra", null],
      ["103", "Centro de custo", null],
    ]);
  });

  it("erro do ERP ao listar obras vira ActionError legível", async () => {
    const id = await criar({ senha: "errada" });
    const erro = await listarObrasDoErp(admin(), id, ambiente).catch((e) => e);
    expect(erro).toBeInstanceOf(ActionError);
    expect((erro as Error).message).toMatch(/recusou/);
  });
});

describe("vínculo de obras", () => {
  it("salva (substituindo) e recusa obra de outra empresa", async () => {
    const id = await criar();
    await salvarVinculos(admin(), id, [
      { idOrigem: "101", obraId: fx.obraId["A-1"] },
      { idOrigem: "102", obraId: fx.obraId["A-2"] },
    ]);
    expect((await obterIntegracao(admin(), id))!.vinculos.map((v) => [v.idOrigem, v.obraCodigo])).toEqual([["101", "A-1"], ["102", "A-2"]]);

    await salvarVinculos(admin(), id, [{ idOrigem: "101", obraId: fx.obraId["A-1"] }]); // substitui
    expect((await obterIntegracao(admin(), id))!.vinculos).toHaveLength(1);

    const alheia = await salvarVinculos(admin(), id, [{ idOrigem: "999", obraId: fx.obraId["B-1"] }]).catch((e) => e);
    expect(alheia).toBeInstanceOf(ActionError);
    expect((alheia as Error).message).toMatch(/não pertence à empresa/);
    expect((await obterIntegracao(admin(), id))!.vinculos).toHaveLength(1); // nada mudou
  });

  it("a mesma obra do ERP não pode apontar para duas obras (índice único)", async () => {
    const id = await criar();
    const erro = await getDb()
      .insert(integracaoObra)
      .values([
        { empresaId: fx.ids.empresaA, integracaoId: id, obraId: fx.obraId["A-1"], idOrigem: "101" },
        { empresaId: fx.ids.empresaA, integracaoId: id, obraId: fx.obraId["A-2"], idOrigem: "101" },
      ])
      .catch((e) => e);
    expect(erro).toBeInstanceOf(Error);
  });

  it("cria obras no RGO a partir do ERP, já vinculadas, tratando códigos repetidos", async () => {
    const id = await criar();
    // Já existe uma obra com o código "555" na empresa.
    await getDb().insert(obra).values({ empresaId: fx.ids.empresaA, codigo: "555", nome: "Obra manual 555" });

    const r = await criarObrasDoErp(admin(), id, [
      { idOrigem: "555", nome: "Obra do ERP 555" },
      { idOrigem: "556", nome: "Obra do ERP 556" },
    ]);
    expect(r.criadas).toBe(2);
    const d = (await obterIntegracao(admin(), id))!;
    expect(d.vinculos.map((v) => [v.idOrigem, v.obraCodigo, v.obraNome]).sort()).toEqual([
      ["555", "555-2", "Obra do ERP 555"],
      ["556", "556", "Obra do ERP 556"],
    ]);

    // De novo: já vinculadas, não duplica.
    expect((await criarObrasDoErp(admin(), id, [{ idOrigem: "555", nome: "x" }])).criadas).toBe(0);
  });
});

describe("solicitar sincronização", () => {
  it("recusa integração pausada, sem vínculos, e ERP ainda não implementado", async () => {
    const id = await criar();
    expect(((await solicitarSincronizacao(admin(), id, "incremental").catch((e) => e)) as Error).message).toMatch(/Teste a conexão/);

    await getDb().update(integracao).set({ status: "ativa" }).where(eq(integracao.id, id));
    expect(((await solicitarSincronizacao(admin(), id, "incremental").catch((e) => e)) as Error).message).toMatch(/Vincule ao menos uma obra/);

    const uau = await criar({ erp: "uau", endereco: "https://uau.exemplo.com.br", indexadorCorrecaoId: null });
    expect(((await solicitarSincronizacao(admin(), uau, "incremental").catch((e) => e)) as Error).message).toMatch(/aguardando a documentação/);
  });

  it("cria a execução 'enfileirada', registra na auditoria e recusa uma segunda enquanto houver uma na fila", async () => {
    const id = await criar();
    await getDb().update(integracao).set({ status: "ativa" }).where(eq(integracao.id, id));
    await salvarVinculos(admin(), id, [{ idOrigem: "101", obraId: fx.obraId["A-1"] }]);

    const { sincronizacaoId } = await solicitarSincronizacao(admin(), id, "historica");
    const [exec] = await getDb().select().from(sincronizacao).where(eq(sincronizacao.id, sincronizacaoId));
    expect(exec).toMatchObject({ status: "enfileirada", gatilho: "carga_historica", integracaoId: id });
    expect(exec!.escopo).toEqual({ tipo: "historica" });

    const segunda = await solicitarSincronizacao(admin(), id, "incremental").catch((e) => e);
    expect(segunda).toBeInstanceOf(ActionError);
    expect((segunda as Error).message).toMatch(/na fila ou em andamento/);

    const ev = await getDb().select().from(auditoria).where(and(eq(auditoria.entidadeId, id), eq(auditoria.acao, "sincronizar")));
    expect(ev).toHaveLength(1);
  });
});

describe("webhook", () => {
  it("gera o segredo UMA vez (só o hash fica guardado) e autentica por Bearer", async () => {
    const id = await criar();
    expect(await autenticarWebhook(id, "qualquer", "sienge")).toBeNull(); // sem segredo configurado

    const { segredo, url } = await gerarSegredoDoWebhook(admin(), id);
    expect(url).toContain(`/api/webhooks/sienge/${id}`);
    const r = await linha(id);
    expect(r.webhookSecretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(r)).not.toContain(segredo);

    expect(await autenticarWebhook(id, segredo, "sienge")).toMatchObject({ id });
    expect(await autenticarWebhook(id, `${segredo}x`, "sienge")).toBeNull();
    expect(await autenticarWebhook(id, null, "sienge")).toBeNull();
    expect(await autenticarWebhook(id, segredo, "uau")).toBeNull(); // ERP diferente
    expect(await autenticarWebhook("nao-e-uuid", segredo, "sienge")).toBeNull();
    expect(await autenticarWebhook(crypto.randomUUID(), segredo, "sienge")).toBeNull();

    // Gerar de novo invalida o anterior.
    const novo = await gerarSegredoDoWebhook(admin(), id);
    expect(await autenticarWebhook(id, segredo, "sienge")).toBeNull();
    expect(await autenticarWebhook(id, novo.segredo, "sienge")).not.toBeNull();

    await desativarWebhook(admin(), id);
    expect(await autenticarWebhook(id, novo.segredo, "sienge")).toBeNull();
  });

  it("registra o webhook no Sienge (POST /hooks) com a URL, o token e os eventos", async () => {
    const id = await criar();
    const r = await registrarWebhookNoErp(admin(), id, ["BILL_CREATED", "BILL_UPDATED"], ambiente);
    expect(r.url).toContain(`/api/webhooks/sienge/${id}`);
    expect(fake.hooks.at(-1)).toMatchObject({ url: r.url, events: ["BILL_CREATED", "BILL_UPDATED"] });
    expect((await linha(id)).webhookSecretHash).not.toBeNull();
    expect(lerConfig((await linha(id)).config).eventosWebhook).toEqual(["BILL_CREATED", "BILL_UPDATED"]);
  });

  it("UAU/Lumia: registro automático indisponível", async () => {
    const id = await criar({ erp: "lumia", endereco: "x", indexadorCorrecaoId: null });
    expect(((await registrarWebhookNoErp(admin(), id, ["X"]).catch((e) => e)) as Error).message).toMatch(/não está disponível/);
  });
});
