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
import { LimitadorTaxa } from "../erp/rate-limit";
import { SiengeAdapter } from "./adapter";
import { resolverBase } from "./client";

let fake: FakeSienge;

beforeAll(async () => {
  fake = await iniciarFakeSienge("demo");
});
afterAll(async () => {
  await fake.fechar();
});
beforeEach(() => {
  fake.dados = { empreendimentos: [], parcelasPagar: [], parcelasReceber: [], itensOrcamento: [] };
  fake.chamadas.clear();
  fake.log.length = 0;
  fake.falhas = {};
});

const adapter = (extra: Partial<ConstructorParameters<typeof SiengeAdapter>[0]> = {}) =>
  new SiengeAdapter({
    endereco: fake.url,
    ...CREDENCIAIS_FAKE,
    indexadorCorrecaoId: 1,
    mapeamento: { valorPagamento: "liquido" },
    escalaPercentual: "0-100",
    permitirCustom: true,
    // Sem esperas reais: limitadores folgados e backoff mínimo.
    limitadores: { rest: new LimitadorTaxa(10_000, 6_000_000), bulk: new LimitadorTaxa(10_000, 6_000_000) },
    http: { baseBackoffMs: 1, maxBackoffMs: 5, timeoutMs: 5000 },
    hoje: () => "2026-10-04",
    ...extra,
  });

const coletar = async <T>(it: AsyncIterable<T>) => {
  const r: T[] = [];
  for await (const x of it) r.push(x);
  return r;
};

describe("resolverBase (anti-SSRF)", () => {
  it("monta as URLs do Sienge a partir do subdomínio", () => {
    const b = resolverBase("MinhaConstrutora", false);
    expect(b.rest).toBe("https://api.sienge.com.br/minhaconstrutora/public/api/v1");
    expect(b.bulk).toBe("https://api.sienge.com.br/minhaconstrutora/public/api/bulk-data/v1");
  });

  it("recusa URL completa em produção e subdomínios inválidos", () => {
    expect(() => resolverBase("http://127.0.0.1:8080/x", false)).toThrow(/apenas o subdomínio/);
    expect(() => resolverBase("https://evil.com", false)).toThrow(/apenas o subdomínio/);
    for (const ruim of ["a.b", "com espaço", "-x", "x-", "x/y", "../x", ""]) {
      expect(() => resolverBase(ruim, true)).toThrow(/inválido/);
    }
  });

  it("aceita URL completa só quando liberado (dev/teste)", () => {
    expect(resolverBase("http://127.0.0.1:9/demo/", true).rest).toBe("http://127.0.0.1:9/demo/public/api/v1");
  });
});

describe("testarConexao", () => {
  it("conecta e informa quantos empreendimentos há", async () => {
    fake.dados.empreendimentos = [empreendimento(101, "Obra A"), empreendimento(102, "Obra B")];
    const r = await adapter().testarConexao();
    expect(r).toEqual({ ok: true, detalhe: expect.stringContaining("2 empreendimento(s)") });
  });

  it("credenciais erradas: mensagem clara, sem repetir tentativas", async () => {
    const r = await adapter({ senha: "errada" }).testarConexao();
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("recusou o usuário/senha") });
    expect(fake.chamadas.get("/v1/enterprises")).toBe(1);
  });

  it("subdomínio/endereço inválido vira mensagem, não exceção", async () => {
    const ruim = adapter({ endereco: "x.y", permitirCustom: false });
    expect(await ruim.testarConexao()).toEqual({ ok: false, erro: expect.stringContaining("inválido") });
    const semSenha = adapter({ senha: "" });
    expect(await semSenha.testarConexao()).toEqual({ ok: false, erro: expect.stringContaining("obrigatórios") });
  });

  it("servidor fora do ar: erro de rede legível", async () => {
    const a = adapter({ endereco: "http://127.0.0.1:1/demo", http: { baseBackoffMs: 1, maxBackoffMs: 2, maxTentativas: 2, timeoutMs: 500 } });
    expect(await a.testarConexao()).toEqual({ ok: false, erro: expect.stringContaining("Não foi possível conectar") });
  });
});

describe("listarObras", () => {
  it("percorre todas as páginas (limit 200)", async () => {
    fake.dados.empreendimentos = Array.from({ length: 450 }, (_, i) => empreendimento(i + 1, `Obra ${i + 1}`, i % 2 ? "2" : "3"));
    const obras = await adapter().listarObras();
    expect(obras).toHaveLength(450);
    expect(obras[0]).toMatchObject({ idOrigem: "1", nome: "Obra 1", tipo: "Centro de custo", empresaOrigem: "Construtora Demo" });
    expect(obras[1]!.tipo).toBe("Obra");
    expect(fake.chamadas.get("/v1/enterprises")).toBe(3); // 200 + 200 + 50
    expect(fake.log.map((l) => l.query.get("offset"))).toEqual(["0", "200", "400"]);
  });
});

describe("listarCustos / listarReceitas", () => {
  it("consulta um mês por vez, por competência, com os parâmetros obrigatórios do Sienge", async () => {
    fake.dados.parcelasPagar = [
      parcelaPagarFake(1, { billDate: "2026-01-10" }),
      parcelaPagarFake(2, { billDate: "2026-03-10", balanceAmount: 500, payments: [] }),
    ];
    const lotes = await coletar(adapter().listarCustos({ inicio: "2026-01-01", fim: "2026-03-31" }));
    expect(lotes.map((l) => [l.periodo.inicio, l.lidos])).toEqual([
      ["2026-01-01", 1],
      ["2026-02-01", 0], // 404 do Sienge = nenhuma parcela, não é erro
      ["2026-03-01", 1],
    ]);
    const chamada = fake.log[0]!.query;
    expect(chamada.get("selectionType")).toBe("B");
    expect(chamada.get("correctionIndexerId")).toBe("1");
    expect(chamada.get("correctionDate")).toBe("2026-10-04");
    expect(chamada.get("withBankMovements")).toBe("false");

    const todos = lotes.flatMap((l) => l.itens);
    expect(todos.map((i) => [i.grupoOrigem, i.situacao])).toEqual([
      ["out:1", "realizado"],
      ["out:2", "a_realizar"],
    ]);
  });

  it("recibos e saldos viram receitas", async () => {
    fake.dados.parcelasReceber = [parcelaReceberFake(9, { balanceAmount: 1000, billDate: "2026-03-31" })];
    const [lote] = await coletar(adapter().listarReceitas({ inicio: "2026-03-01", fim: "2026-03-31" }));
    expect(lote!.itens.map((i) => [i.tipo, i.situacao, i.valorCentavos])).toEqual([
      ["receita", "realizado", 500_000],
      ["receita", "a_realizar", 100_000],
    ]);
    expect(fake.log[0]!.query.get("correctionIndexerId")).toBeNull(); // opcional no /income
  });

  it("parcela com dados inesperados é descartada com aviso; as demais seguem", async () => {
    fake.dados.parcelasPagar = [parcelaPagarFake(1), { billId: "texto-no-lugar-de-numero", installmentId: 2, billDate: "2026-03-05" }, parcelaPagarFake(3)];
    const [lote] = await coletar(adapter().listarCustos({ inicio: "2026-03-01", fim: "2026-03-31" }));
    expect(lote!.lidos).toBe(3);
    expect(lote!.itens.map((i) => i.grupoOrigem)).toEqual(["out:1", "out:3"]);
    expect(lote!.avisos).toHaveLength(1);
    expect(lote!.avisos[0]).toMatch(/posição 2.*descartada/);
  });

  it("repete em 429 (respeitando Retry-After) e em 500, e termina com sucesso", async () => {
    fake.dados.parcelasPagar = [parcelaPagarFake(1)];
    fake.falhas = { http429: 2, http500: 1, retryAfter: 0 };
    const [lote] = await coletar(adapter().listarCustos({ inicio: "2026-03-01", fim: "2026-03-31" }));
    expect(lote!.itens).toHaveLength(1);
    expect(fake.chamadas.get("/bulk-data/v1/outcome")).toBe(4); // 2×429 + 1×500 + sucesso
  });

  it("credenciais erradas no bulk interrompem com erro claro", async () => {
    await expect(coletar(adapter({ senha: "x" }).listarCustos({ inicio: "2026-03-01", fim: "2026-03-31" }))).rejects.toThrow(/recusou o usuário\/senha/);
  });

  it("o limitador BULK espaça as chamadas (20/min ⇒ ~3 s entre elas)", async () => {
    fake.dados.parcelasPagar = [parcelaPagarFake(1)];
    const bulk = new LimitadorTaxa(1, 600); // 600/min = 1 a cada 100 ms (para o teste ser rápido)
    const a = adapter({ limitadores: { rest: new LimitadorTaxa(100, 6000), bulk } });
    await coletar(a.listarCustos({ inicio: "2026-01-01", fim: "2026-03-31" }));
    const instantes = fake.log.map((l) => l.em);
    expect(instantes).toHaveLength(3);
    expect(instantes[2]! - instantes[0]!).toBeGreaterThanOrEqual(180);
  });
});

describe("orçamento e avanço", () => {
  const itens = [
    itemOrcamentoFake({ wbsCode: "01", workItemId: null, description: "Fundação", totalPrice: 9999 }),
    itemOrcamentoFake({ wbsCode: "01.001", workItemId: 1, totalPrice: 1000, scheduledPercentComplete: 50, percentComplete: 40, pricesByCategory: [{ category: "MATERIAL", totalPrice: 1000 }] }),
    itemOrcamentoFake({ wbsCode: "01.002", workItemId: 2, totalPrice: 3000, scheduledPercentComplete: 100, percentComplete: 80, pricesByCategory: [{ category: "LABOR", totalPrice: 3000 }] }),
    itemOrcamentoFake({ buildingId: 202, wbsCode: "01.001", workItemId: 1, totalPrice: 777, pricesByCategory: [{ category: "MATERIAL", totalPrice: 777 }] }),
  ];

  it("filtra por obra e agrega por etapa × grupo", async () => {
    fake.dados.itensOrcamento = itens;
    const linhas = await adapter().listarOrcamento("101");
    expect(linhas.map((l) => [l.etapa?.codigo, l.grupo, l.valorCentavos])).toEqual([
      ["01", "mao_obra_direta", 300_000],
      ["01", "material", 100_000],
    ]);
    expect(linhas[0]!.etapa?.nome).toBe("Fundação");
    expect(fake.log[0]!.query.get("buildingId")).toBe("101");
  });

  it("avanço: acumulado por fim de mês (limitado a hoje) e 'no mês' pela diferença", async () => {
    fake.dados.itensOrcamento = itens;
    const meses = ["2026-08", "2026-09", "2026-10"];
    const serie = await adapter().listarAvanco!("101", meses);

    // Mesmos percentuais em todas as datas (o fake não varia por dataDate): acumulado 0,875/0,7;
    // o 1º mês é só referência (não é devolvido) e o "no mês" dos seguintes é 0.
    expect(serie.map((s) => s.competencia).sort()).toEqual(["2026-09-01", "2026-09-01", "2026-10-01", "2026-10-01"]);
    const real = serie.find((s) => s.tipo === "realizado" && s.competencia === "2026-09-01")!;
    expect(real).toMatchObject({ pctAcumBps: 7000, pctMesBps: 0, versao: 0 });
    expect(serie.find((s) => s.tipo === "planejado")).toMatchObject({ pctAcumBps: 8750, versao: 1 });

    const datas = fake.log.map((l) => l.query.get("dataDate"));
    expect(datas).toEqual(["2026-08-31", "2026-09-30", "2026-10-04"]); // o mês corrente é cortado em "hoje"
  });

  it("obra sem orçamento: listas vazias, sem erro", async () => {
    expect(await adapter().listarOrcamento("999")).toEqual([]);
    expect(await adapter().listarAvanco!("999", ["2026-09"])).toEqual([]);
  });
});
