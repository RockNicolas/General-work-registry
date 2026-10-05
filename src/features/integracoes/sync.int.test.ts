import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CREDENCIAIS_FAKE,
  type FakeSienge,
  empreendimento,
  iniciarFakeSienge,
  itemOrcamentoFake,
  parcelaPagarFake,
  parcelaReceberFake,
} from "@/test/fake-sienge";
import { createTenantFixture, type TenantFixture } from "@/test/fixtures";
import { getDb, getPool } from "@/server/db/client";
import { auditoria, avancoFisico, categoria, etapa, integracao, integracaoObra, lancamento, orcamento, sincronizacao } from "@/server/db/schema";
import { criptografar } from "./crypto";
import { LimitadorTaxa } from "./erp/rate-limit";
import { type AmbienteSync, executarSincronizacao } from "./sync";

let fx: TenantFixture;
let fake: FakeSienge;
let integracaoId: string;

const HOJE = "2026-03-15";

beforeAll(async () => {
  fx = await createTenantFixture();
  fake = await iniciarFakeSienge("demo");
});

afterAll(async () => {
  const db = getDb();
  await db.delete(auditoria).where(inArray(auditoria.empresaId, [fx.ids.empresaA, fx.ids.empresaB]));
  await db.delete(lancamento).where(inArray(lancamento.empresaId, [fx.ids.empresaA, fx.ids.empresaB]));
  await db.delete(integracao).where(inArray(integracao.empresaId, [fx.ids.empresaA, fx.ids.empresaB])); // cascata: vínculos e execuções
  await fx?.cleanup();
  await fake?.fechar();
  await getPool().end();
});

const amb = (extra: Partial<AmbienteSync> = {}): AmbienteSync => ({
  hoje: () => HOJE,
  ambiente: {
    permitirCustom: true,
    http: { baseBackoffMs: 1, maxBackoffMs: 5, timeoutMs: 5000 },
    limitadores: { rest: new LimitadorTaxa(10_000, 6_000_000), bulk: new LimitadorTaxa(10_000, 6_000_000) },
    hoje: () => HOJE,
  },
  ...extra,
});

/** Cria a integração (com credenciais criptografadas) apontando para o servidor falso. */
async function criarIntegracao(config: Record<string, unknown> = {}, credenciais: { usuario: string; senha: string } = CREDENCIAIS_FAKE) {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.insert(integracao).values({
    id,
    empresaId: fx.ids.empresaA,
    erp: "sienge",
    nome: `Sienge ${id.slice(0, 6)}`,
    endereco: fake.url,
    credenciaisEnc: criptografar(JSON.stringify(credenciais), `integracao:${id}`).valor,
    status: "ativa",
    config: { indexadorCorrecaoId: 1, mesesReprocessar: 3, mesesFuturos: 6, sincronizarAvanco: false, ...config },
  });
  await db.insert(integracaoObra).values([
    { empresaId: fx.ids.empresaA, integracaoId: id, obraId: fx.obraId["A-1"], idOrigem: "101" },
    { empresaId: fx.ids.empresaA, integracaoId: id, obraId: fx.obraId["A-2"], idOrigem: "102" },
  ]);
  return id;
}

async function novaExecucao(id: string, gatilho: "manual" | "carga_historica" = "manual", tipo = "incremental") {
  const [s] = await getDb()
    .insert(sincronizacao)
    .values({ empresaId: fx.ids.empresaA, integracaoId: id, gatilho, escopo: { tipo } })
    .returning({ id: sincronizacao.id });
  return s!.id;
}

const rodar = async (id = integracaoId, extra: Partial<AmbienteSync> = {}) => {
  const execId = await novaExecucao(id);
  const r = await executarSincronizacao(execId, amb(extra));
  const [linha] = await getDb().select().from(sincronizacao).where(eq(sincronizacao.id, execId));
  return { r, linha: linha!, execId };
};

const doErp = (id = integracaoId) =>
  getDb().select().from(lancamento).where(and(eq(lancamento.integracaoId, id), eq(lancamento.origem, "erp")));

const logTexto = (l: { log: unknown }) => (l.log as { msg: string }[]).map((x) => x.msg).join("\n");

beforeEach(async () => {
  fake.dados = { empreendimentos: [], parcelasPagar: [], parcelasReceber: [], itensOrcamento: [] };
  fake.chamadas.clear();
  fake.log.length = 0;
  fake.falhas = {};
  fake.dados.empreendimentos = [empreendimento(101, "Obra Cem e Um"), empreendimento(102, "Obra Cem e Dois"), empreendimento(999, "Sem vínculo")];
  // Integração nova a cada teste: isolamento total.
  integracaoId = await criarIntegracao();
});

describe("sincronização de custos e receitas", () => {
  const cenario = () => {
    fake.dados.parcelasPagar = [
      // paga + saldo, rateada entre as duas obras vinculadas (60/40)
      parcelaPagarFake(1, {
        originalAmount: 10000, balanceAmount: 4000, billDate: "2026-02-10", dueDate: "2026-02-20",
        paymentsCategories: [
          { costCenterId: 101, financialCategoryId: "2.01", financialCategoryName: "Materiais de construção", financialCategoryRate: 60 },
          { costCenterId: 102, financialCategoryId: "2.01", financialCategoryName: "Materiais de construção", financialCategoryRate: 40 },
        ],
        payments: [{ sequencialNumber: 1, grossAmount: 6000, netAmount: 5900, paymentDate: "2026-02-18" }],
      }),
      // título de previsão, ainda em aberto
      parcelaPagarFake(2, { originalAmount: 3000, balanceAmount: 3000, payments: [], forecastDocument: "PREV-1", billDate: "2026-03-01", dueDate: "2026-04-30" }),
      // centro de custo sem vínculo no RGO: ignorada
      parcelaPagarFake(3, { paymentsCategories: [{ costCenterId: 999, financialCategoryId: "9.99", financialCategoryName: "Outros", financialCategoryRate: 100 }] }),
      // devolução a sócio (classe fora da margem)
      parcelaPagarFake(4, {
        originalAmount: 700, balanceAmount: 0, billDate: "2026-03-05",
        paymentsCategories: [{ costCenterId: 101, financialCategoryId: "2.90", financialCategoryName: "Devolução de aporte a sócios", financialCategoryRate: 100 }],
        payments: [{ sequencialNumber: 1, grossAmount: 700, netAmount: 700, paymentDate: "2026-03-10" }],
      }),
    ];
    fake.dados.parcelasReceber = [
      parcelaReceberFake(10, { originalAmount: 50000, balanceAmount: 20000, billDate: "2026-02-28", receipts: [{ operationTypeName: "Recebimento", grossAmount: 30000, netAmount: 30000, paymentDate: "2026-03-05" }] }),
      parcelaReceberFake(11, {
        originalAmount: 800, balanceAmount: 0, billDate: "2026-03-02",
        receiptsCategories: [{ costCenterId: 102, financialCategoryId: "1.50", financialCategoryName: "Aporte de capital", financialCategoryRate: 100 }],
        receipts: [{ operationTypeName: "Recebimento", grossAmount: 800, netAmount: 800, paymentDate: "2026-03-06" }],
      }),
    ];
  };

  it("lê o ERP, mapeia obras/categorias/classes e grava com a origem certa", async () => {
    cenario();
    const { r, linha } = await rodar();
    expect(r).toMatchObject({ executada: true, status: "concluida" });
    expect(linha).toMatchObject({ status: "concluida", erros: 0 });
    expect(linha.iniciadaEm).not.toBeNull();
    expect(linha.finalizadaEm).not.toBeNull();

    const rows = await doErp();
    const por = (id: string) => rows.find((x) => x.idOrigem === id)!;

    // Parcela 1: realizado (líquido) + saldo, rateado 60/40 entre A-1 e A-2.
    expect(por("out:1:p1:101:2.01")).toMatchObject({ obraId: fx.obraId["A-1"], valorCentavos: 354_000, situacao: "realizado", dataLiquidacao: "2026-02-18", tipo: "custo", origem: "erp", empresaId: fx.ids.empresaA });
    expect(por("out:1:p1:102:2.01")).toMatchObject({ obraId: fx.obraId["A-2"], valorCentavos: 236_000 });
    expect(por("out:1:saldo:101:2.01")).toMatchObject({ valorCentavos: 240_000, situacao: "a_realizar", dataVencimento: "2026-02-20", isPrevisao: false });
    // Previsão.
    expect(por("out:2:saldo:101:2.01.01")).toMatchObject({ isPrevisao: true, situacao: "a_realizar", valorCentavos: 300_000 });
    // Sem vínculo: nada gravado.
    expect(rows.some((x) => x.idOrigem?.startsWith("out:3:"))).toBe(false);
    // Classes (fora da margem).
    expect(por("out:4:p1:101:2.90").classe).toBe("devolucao_socio");
    expect(por("inc:11:r1-2026-03-06:102:1.50").classe).toBe("aporte");
    expect(por("inc:10:saldo:101:1.01.01")).toMatchObject({ tipo: "receita", situacao: "a_realizar", classe: "operacional", valorCentavos: 2_000_000 });

    // Categorias criadas a partir do plano financeiro, com o grupo sugerido.
    const cats = await getDb().select().from(categoria).where(and(eq(categoria.empresaId, fx.ids.empresaA), inArray(categoria.codigoOrigem, ["2.01", "2.01.01", "1.50", "1.01.01"])));
    expect(cats.find((c) => c.codigoOrigem === "2.01")).toMatchObject({ nome: "Materiais de construção", grupo: "material" });
    expect(cats.find((c) => c.codigoOrigem === "1.50")!.grupo).toBe("receita");

    // Log e contadores.
    const texto = logTexto(linha);
    expect(texto).toMatch(/Itens ignorados por centro de custo\/obra sem vínculo no RGO: 999/);
    expect(texto).toMatch(/categoria\(s\) criada\(s\)/);
    expect(linha.lidos).toBe(6); // 4 pagar + 2 receber
    expect(linha.gravados).toBe(rows.length);

    // Nada vazou para outra empresa.
    expect(rows.every((x) => x.empresaId === fx.ids.empresaA)).toBe(true);
    const [integ] = await getDb().select().from(integracao).where(eq(integracao.id, integracaoId));
    expect(integ).toMatchObject({ status: "ativa", ultimoErro: null });
    expect(integ!.ultimaSyncEm).not.toBeNull();
  });

  it("é idempotente: sincronizar de novo não duplica nem altera nada", async () => {
    cenario();
    await rodar();
    const total = (await doErp()).length;
    const segunda = await rodar();
    expect(segunda.r).toMatchObject({ status: "concluida", gravados: 0 });
    expect((await doErp()).length).toBe(total);
    expect(segunda.linha.ignorados).toBeGreaterThanOrEqual(total); // todos "sem mudança" (+ os de obra sem vínculo)
  });

  it("acompanha o ERP: pagamento quita o saldo (saldo some, baixa entra) e valores editados atualizam", async () => {
    cenario();
    await rodar();
    expect((await doErp()).some((x) => x.idOrigem === "out:2:saldo:101:2.01.01")).toBe(true);

    // A parcela 2 foi paga no ERP e a 1 teve o saldo reduzido.
    fake.dados.parcelasPagar[1] = parcelaPagarFake(2, { originalAmount: 3000, balanceAmount: 0, forecastDocument: "PREV-1", billDate: "2026-03-01", payments: [{ sequencialNumber: 1, netAmount: 3000, grossAmount: 3000, paymentDate: "2026-03-12" }] });
    (fake.dados.parcelasPagar[0] as { balanceAmount: number }).balanceAmount = 1000;
    const { linha } = await rodar();

    const rows = await doErp();
    expect(rows.some((x) => x.idOrigem === "out:2:saldo:101:2.01.01")).toBe(false); // saldo removido
    expect(rows.find((x) => x.idOrigem === "out:2:p1:101:2.01.01")).toMatchObject({ situacao: "realizado", valorCentavos: 300_000, dataLiquidacao: "2026-03-12" });
    expect(rows.find((x) => x.idOrigem === "out:1:saldo:101:2.01")!.valorCentavos).toBe(60_000); // 1000 × 60%
    expect(logTexto(linha)).toMatch(/removido\(s\) por não existirem mais no ERP/);
  });

  it("parcela excluída no ERP é removida; a varredura só mexe em obras vinculadas", async () => {
    cenario();
    await rodar();
    // Um lançamento de ERP de obra NÃO vinculada (histórico) não pode ser tocado.
    const [historico] = await getDb().insert(lancamento).values({
      empresaId: fx.ids.empresaB, obraId: fx.obraId["B-1"], categoriaId: fx.categoriaId.B, tipo: "custo",
      valorCentavos: 100, dataCompetencia: "2026-02-01", origem: "erp", integracaoId: null, idOrigem: "out:777:p1:1:x",
    }).returning({ id: lancamento.id });

    fake.dados.parcelasPagar = fake.dados.parcelasPagar.filter((p) => p.installmentId !== 4);
    await rodar();
    expect((await doErp()).some((x) => x.idOrigem?.startsWith("out:4:"))).toBe(false);
    expect((await getDb().select().from(lancamento).where(eq(lancamento.id, historico!.id))).length).toBe(1);
  });

  it("não apaga em massa: remoção grande demais é tratada como falha parcial do ERP", async () => {
    fake.dados.parcelasPagar = Array.from({ length: 40 }, (_, i) => parcelaPagarFake(1000 + i, { billDate: "2026-02-10", originalAmount: 100 + i, balanceAmount: 0 }));
    await rodar();
    const antes = (await doErp()).length;
    expect(antes).toBe(40);

    fake.dados.parcelasPagar = fake.dados.parcelasPagar.slice(0, 5); // "sumiram" 35 de 40
    const { r, linha } = await rodar();
    expect((await doErp()).length).toBe(antes); // nada foi apagado
    expect(r).toMatchObject({ status: "concluida_com_erros" });
    expect(logTexto(linha)).toMatch(/BLOQUEADA/);
  });

  it("período que o ERP devolve vazio (404) NÃO apaga o que já existe", async () => {
    fake.dados.parcelasPagar = [parcelaPagarFake(1, { billDate: "2026-02-10" }), parcelaPagarFake(2, { billDate: "2026-02-11" })];
    await rodar();
    expect((await doErp()).length).toBe(2);
    fake.dados.parcelasPagar = []; // o Sienge responde 404 para fevereiro
    await rodar();
    expect((await doErp()).length).toBe(2);
  });

  it("só consulta a janela configurada (incremental: poucos meses atrás + meses futuros)", async () => {
    await rodar();
    const meses = fake.log.filter((l) => l.caminho === "/bulk-data/v1/outcome").map((l) => l.query.get("startDate")!.slice(0, 7));
    expect(meses[0]).toBe("2025-12"); // 3 meses antes de março/2026
    expect(meses.at(-1)).toBe("2026-09"); // 6 meses à frente
    expect(meses).toHaveLength(10);
  });

  it("carga histórica usa a janela longa", async () => {
    const id = integracaoId;
    const execId = await novaExecucao(id, "carga_historica", "historica");
    await executarSincronizacao(execId, amb());
    const meses = fake.log.filter((l) => l.caminho === "/bulk-data/v1/outcome").map((l) => l.query.get("startDate")!.slice(0, 7));
    expect(meses[0]).toBe("2024-03"); // 24 meses atrás
    expect(meses).toHaveLength(31);
  });

  it("sobrevive a 429 e 500 do ERP (retry com backoff) e conclui", async () => {
    fake.dados.parcelasPagar = [parcelaPagarFake(1, { billDate: "2026-02-10" })];
    fake.falhas = { http429: 2, http500: 2, retryAfter: 0 }; // 4 falhas seguidas < 5 tentativas
    const { r } = await rodar();
    expect(r).toMatchObject({ status: "concluida" });
    expect((await doErp()).length).toBe(1);
  });

  it("adota categoria existente de mesmo nome (sem código de ERP) e não duplica", async () => {
    const [existente] = await getDb().insert(categoria).values({ empresaId: fx.ids.empresaA, nome: "Cimento Especial Adotado", grupo: "material" }).returning({ id: categoria.id });
    fake.dados.parcelasPagar = [
      parcelaPagarFake(1, { billDate: "2026-02-10", paymentsCategories: [{ costCenterId: 101, financialCategoryId: "8.88", financialCategoryName: "Cimento Especial Adotado", financialCategoryRate: 100 }] }),
    ];
    await rodar();
    const cats = await getDb().select().from(categoria).where(and(eq(categoria.empresaId, fx.ids.empresaA), eq(categoria.codigoOrigem, "8.88")));
    expect(cats).toHaveLength(1);
    expect(cats[0]!.id).toBe(existente!.id); // adotada: ganhou o código do ERP, sem criar outra
  });

  it("nome igual com código de ERP diferente: cria outra categoria com o código no nome", async () => {
    await getDb().insert(categoria).values({ empresaId: fx.ids.empresaA, nome: "Aço Conflitante", grupo: "material", codigoOrigem: "5.55" });
    fake.dados.parcelasPagar = [
      parcelaPagarFake(1, { billDate: "2026-02-10", paymentsCategories: [{ costCenterId: 101, financialCategoryId: "5.56", financialCategoryName: "Aço Conflitante", financialCategoryRate: 100 }] }),
    ];
    await rodar();
    const [nova] = await getDb().select().from(categoria).where(and(eq(categoria.empresaId, fx.ids.empresaA), eq(categoria.codigoOrigem, "5.56")));
    expect(nova!.nome).toBe("Aço Conflitante (5.56)");
  });

  it("com a criação automática desligada, categorias novas do ERP não são criadas (usa a do grupo)", async () => {
    const id2 = await criarIntegracao({ criarCategoriasAutomaticamente: false });
    fake.dados.parcelasPagar = [
      parcelaPagarFake(5, { billDate: "2026-02-10", paymentsCategories: [{ costCenterId: 101, financialCategoryId: "7.77", financialCategoryName: "Novidade do ERP", financialCategoryRate: 100 }] }),
    ];
    await rodar(id2);
    const [semCriar] = await getDb().select().from(categoria).where(and(eq(categoria.empresaId, fx.ids.empresaA), eq(categoria.codigoOrigem, "7.77")));
    expect(semCriar).toBeUndefined();
    expect((await doErp(id2)).length).toBe(1);
  });
});

describe("falhas", () => {
  it("credenciais recusadas: falha com mensagem clara, integração marcada com erro, nada gravado", async () => {
    const id = await criarIntegracao({}, { usuario: "api-teste", senha: "errada" });
    const { r, linha } = await rodar(id);
    expect(r).toMatchObject({ executada: true, status: "falhou" });
    expect(linha.status).toBe("falhou");
    expect(logTexto(linha)).toMatch(/recusou o usuário\/senha/);
    const [integ] = await getDb().select().from(integracao).where(eq(integracao.id, id));
    expect(integ).toMatchObject({ status: "erro" });
    expect(integ!.ultimoErro).toMatch(/recusou/);
    expect((await doErp(id)).length).toBe(0);
  });

  it("depois de corrigir a causa, a próxima sincronização volta ao normal", async () => {
    fake.dados.parcelasPagar = [parcelaPagarFake(1, { billDate: "2026-02-10" })];
    await getDb().update(integracao).set({ status: "erro", ultimoErro: "falha antiga" }).where(eq(integracao.id, integracaoId));
    const { r } = await rodar();
    expect(r).toMatchObject({ status: "concluida" });
    const [integ] = await getDb().select().from(integracao).where(eq(integracao.id, integracaoId));
    expect(integ).toMatchObject({ status: "ativa", ultimoErro: null });
  });

  it("sem obras vinculadas: falha explicando o que fazer", async () => {
    await getDb().delete(integracaoObra).where(eq(integracaoObra.integracaoId, integracaoId));
    const { linha } = await rodar();
    expect(linha.status).toBe("falhou");
    expect(logTexto(linha)).toMatch(/Vincule as obras/);
  });

  it("ERP fora do ar: falha de rede legível (não estoura exceção)", async () => {
    await getDb().update(integracao).set({ endereco: "http://127.0.0.1:1/demo" }).where(eq(integracao.id, integracaoId));
    const { linha } = await rodar(integracaoId, { ambiente: { ...amb().ambiente, http: { baseBackoffMs: 1, maxBackoffMs: 2, maxTentativas: 2, timeoutMs: 500 } } });
    expect(linha.status).toBe("falhou");
    expect(logTexto(linha)).toMatch(/Não foi possível conectar/);
  });

  it("credencial adulterada no banco não abre (e não vaza detalhes)", async () => {
    await getDb().update(integracao).set({ credenciaisEnc: "v1.AAAA.BBBB.CCCC" }).where(eq(integracao.id, integracaoId));
    const { linha } = await rodar();
    expect(linha.status).toBe("falhou");
    expect(logTexto(linha)).toMatch(/descriptografar/);
  });

  it("UAU e Lumia: a sincronização falha com 'aguardando a documentação'", async () => {
    await getDb().update(integracao).set({ erp: "lumia" }).where(eq(integracao.id, integracaoId));
    const { linha } = await rodar();
    expect(linha.status).toBe("falhou");
    expect(logTexto(linha)).toMatch(/aguardando a documentação/i);
  });
});

describe("reserva da execução", () => {
  it("execução concorrente da mesma linha: só uma roda", async () => {
    fake.dados.parcelasPagar = [parcelaPagarFake(1, { billDate: "2026-02-10" })];
    const execId = await novaExecucao(integracaoId);
    const [a, b] = await Promise.all([executarSincronizacao(execId, amb()), executarSincronizacao(execId, amb())]);
    expect([a.executada, b.executada].sort()).toEqual([false, true]);
    expect((await doErp()).length).toBe(1);
  });

  it("linha já concluída não executa de novo", async () => {
    const { execId } = await rodar();
    const de_novo = await executarSincronizacao(execId, amb());
    expect(de_novo).toMatchObject({ executada: false });
  });

  it("não deixa duas sincronizações da MESMA integração rodarem juntas", async () => {
    // Uma execução recém-iniciada (em andamento).
    await getDb().insert(sincronizacao).values({ empresaId: fx.ids.empresaA, integracaoId, gatilho: "agendada", status: "executando", iniciadaEm: new Date() });
    const { linha } = await rodar();
    expect(linha.status).toBe("falhou");
    expect(logTexto(linha)).toMatch(/outra sincronização desta integração em andamento/);
  });

  it("execução presa há muito tempo é reassumida", async () => {
    const [presa] = await getDb().insert(sincronizacao).values({
      empresaId: fx.ids.empresaA, integracaoId, gatilho: "agendada", status: "executando", iniciadaEm: new Date(Date.now() - 2 * 3_600_000),
    }).returning({ id: sincronizacao.id });
    const r = await executarSincronizacao(presa!.id, amb());
    expect(r).toMatchObject({ executada: true, status: "concluida" });
  });
});

describe("orçamento e avanço físico", () => {
  const itens = () => [
    itemOrcamentoFake({ wbsCode: "01", workItemId: null, description: "Fundação", totalPrice: 999 }),
    itemOrcamentoFake({ wbsCode: "01.001", workItemId: 1, totalPrice: 1000, scheduledPercentComplete: 50, percentComplete: 40, pricesByCategory: [{ category: "MATERIAL", totalPrice: 600 }, { category: "LABOR", totalPrice: 400 }] }),
    itemOrcamentoFake({ wbsCode: "01.002", workItemId: 2, totalPrice: 3000, scheduledPercentComplete: 100, percentComplete: 80, pricesByCategory: [{ category: "EQUIPMENT", totalPrice: 3000 }] }),
  ];

  // Só as linhas desta integração (outras integrações/testes podem ter orçamento na mesma obra).
  const orcamentoDaObra = (obraId: string) =>
    getDb().select().from(orcamento).where(and(eq(orcamento.obraId, obraId), eq(orcamento.origem, "erp"), like(orcamento.idOrigem, `${integracaoId}:%`)));

  it("grava o orçamento por etapa × grupo, cria a etapa e é idempotente", async () => {
    fake.dados.itensOrcamento = itens();
    await getDb().update(integracao).set({ config: { indexadorCorrecaoId: 1, sincronizarAvanco: false } }).where(eq(integracao.id, integracaoId));
    const { linha } = await rodar();
    expect(linha.status).toBe("concluida");

    const rows = await orcamentoDaObra(fx.obraId["A-1"]);
    expect(rows.map((r) => r.valorPrevistoCentavos).sort((a, b) => a - b)).toEqual([40_000, 60_000, 300_000]);
    expect(rows.every((r) => r.vigente && r.versao === 1 && r.origem === "erp")).toBe(true);
    expect(rows.every((r) => r.idOrigem!.startsWith(`${integracaoId}:bud:101:v1:01:`))).toBe(true);

    const [e] = await getDb().select().from(etapa).where(and(eq(etapa.obraId, fx.obraId["A-1"]), eq(etapa.codigo, "01")));
    expect(e!.nome).toBe("Fundação");
    expect((await orcamentoDaObra(fx.obraId["A-2"])).length).toBe(0); // obra 102 não tem orçamento no ERP

    const de_novo = await rodar();
    expect((await orcamentoDaObra(fx.obraId["A-1"])).length).toBe(3);
    expect(de_novo.r).toMatchObject({ status: "concluida", gravados: 0 });
  });

  it("nova versão do orçamento aposenta a anterior (só a vigente conta)", async () => {
    fake.dados.itensOrcamento = itens();
    await rodar();
    // Versão 2 com valores novos.
    fake.dados.itensOrcamento = itens().map((item) => {
      const i = item as Record<string, unknown>;
      return { ...i, versionNumber: 2, totalPrice: (i.totalPrice as number) * 2, pricesByCategory: (i.pricesByCategory as { category: string; totalPrice: number }[] | undefined)?.map((p) => ({ ...p, totalPrice: p.totalPrice * 2 })) };
    });
    await rodar();

    const rows = await orcamentoDaObra(fx.obraId["A-1"]);
    expect(rows.filter((r) => r.versao === 1).every((r) => !r.vigente)).toBe(true);
    expect(rows.filter((r) => r.versao === 2).every((r) => r.vigente)).toBe(true);
    const vigente = rows.filter((r) => r.vigente).reduce((s, r) => s + r.valorPrevistoCentavos, 0);
    expect(vigente).toBe(800_000); // (1000 + 3000) × 2 reais
  });

  it("avanço físico: planejado (versão 1) e realizado (versão 0) por mês", async () => {
    fake.dados.itensOrcamento = itens();
    await getDb().update(integracao).set({ config: { indexadorCorrecaoId: 1, sincronizarOrcamento: false, sincronizarAvanco: true, mesesAvanco: 2 } }).where(eq(integracao.id, integracaoId));
    const { linha } = await rodar();
    expect(linha.status).toBe("concluida");

    const rows = await getDb().select().from(avancoFisico).where(eq(avancoFisico.obraId, fx.obraId["A-1"]));
    // meses 2026-01 (referência), 02, 03 → devolve fev e mar.
    expect(rows.map((r) => r.competencia).sort()).toEqual(["2026-02-01", "2026-02-01", "2026-03-01", "2026-03-01"]);
    const real = rows.find((r) => r.tipo === "realizado" && r.competencia === "2026-03-01")!;
    expect(real).toMatchObject({ versao: 0, pctAcumBps: 7000 }); // (1000×0,4 + 3000×0,8) / 4000
    expect(rows.find((r) => r.tipo === "planejado")).toMatchObject({ versao: 1, pctAcumBps: 8750 });
  });
});

describe("auditoria", () => {
  it("cada sincronização concluída fica registrada, atribuída ao sistema", async () => {
    fake.dados.parcelasPagar = [parcelaPagarFake(1, { billDate: "2026-02-10" })];
    await rodar();
    const eventos = await getDb().select().from(auditoria).where(and(eq(auditoria.entidade, "integracao"), eq(auditoria.entidadeId, integracaoId)));
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ acao: "sincronizar", usuarioNome: "Sistema (sincronização)", empresaId: fx.ids.empresaA });
  });
});
