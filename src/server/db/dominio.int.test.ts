import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppContext } from "@/features/auth/context";
import { createTenantFixture, type TenantFixture } from "@/test/fixtures";
import { getDb, getPool } from "./client";
import { describeError } from "./migrate";
import {
  auditoria,
  avancoFisico,
  categoria,
  etapa,
  integracao,
  lancamento,
  orcamento,
} from "./schema";
import { withScope } from "./scope";

let fx: TenantFixture;

beforeAll(async () => {
  fx = await createTenantFixture();
});

afterAll(async () => {
  await fx?.cleanup();
  await getPool().end();
});

async function falhaCom(promise: Promise<unknown>, padrao: RegExp) {
  try {
    await promise;
  } catch (error) {
    expect(describeError(error)).toMatch(padrao);
    return;
  }
  throw new Error(`Esperava falha com ${padrao}, mas a operação passou`);
}

const lancamentosVisiveis = async (ctx: AppContext) =>
  (
    await withScope(ctx, (tx) =>
      tx
        .select({ d: lancamento.descricao })
        .from(lancamento)
        .where(inArray(lancamento.id, Object.values(fx.lancamentoId))),
    )
  )
    .map((r) => r.d)
    .sort();

describe("RLS: lançamentos (ligados a obra)", () => {
  it("administrador vê todos", async () => {
    expect(await lancamentosVisiveis(fx.ctx.admin)).toEqual(["lanc A-1", "lanc A-2", "lanc B-1"]);
  });

  it("empresa vê só os da própria empresa", async () => {
    expect(await lancamentosVisiveis(fx.ctx.empresaA)).toEqual(["lanc A-1", "lanc A-2"]);
    expect(await lancamentosVisiveis(fx.ctx.empresaB)).toEqual(["lanc B-1"]);
  });

  it("cliente vê só os da obra liberada", async () => {
    expect(await lancamentosVisiveis(fx.ctx.clienteA)).toEqual(["lanc A-1"]);
  });

  it("sem vínculo não vê nada", async () => {
    expect(await lancamentosVisiveis(fx.ctx.semVinculo)).toEqual([]);
  });

  it("cliente não escreve lançamentos", async () => {
    await falhaCom(
      withScope(fx.ctx.clienteA, (tx) =>
        tx.insert(lancamento).values({
          empresaId: fx.ids.empresaA,
          obraId: fx.obraId["A-1"],
          categoriaId: fx.categoriaId.A,
          tipo: "custo",
          valorCentavos: 1,
          dataCompetencia: "2026-02-01",
        }),
      ),
      /row-level security/,
    );
  });

  it("empresa grava lançamento da própria obra e não o de outra empresa", async () => {
    const [criado] = await withScope(fx.ctx.empresaA, (tx) =>
      tx
        .insert(lancamento)
        .values({
          empresaId: fx.ids.empresaA,
          obraId: fx.obraId["A-1"],
          categoriaId: fx.categoriaId.A,
          tipo: "custo",
          valorCentavos: 1,
          dataCompetencia: "2026-02-01",
        })
        .returning({ id: lancamento.id }),
    );
    expect(criado).toBeDefined();

    await falhaCom(
      withScope(fx.ctx.empresaA, (tx) =>
        tx.insert(lancamento).values({
          empresaId: fx.ids.empresaB,
          obraId: fx.obraId["B-1"],
          categoriaId: fx.categoriaId.B,
          tipo: "custo",
          valorCentavos: 1,
          dataCompetencia: "2026-02-01",
        }),
      ),
      /row-level security/,
    );
  });
});

describe("RLS: categorias (por empresa)", () => {
  const nomesVisiveis = async (ctx: AppContext) =>
    (
      await withScope(ctx, (tx) =>
        tx
          .select({ empresaId: categoria.empresaId })
          .from(categoria)
          .where(inArray(categoria.id, Object.values(fx.categoriaId))),
      )
    ).map((r) => r.empresaId);

  it("empresa e cliente leem as categorias da própria empresa, e só elas", async () => {
    expect(await nomesVisiveis(fx.ctx.empresaA)).toEqual([fx.ids.empresaA]);
    expect(await nomesVisiveis(fx.ctx.clienteA)).toEqual([fx.ids.empresaA]);
    expect(await nomesVisiveis(fx.ctx.empresaB)).toEqual([fx.ids.empresaB]);
    expect(await nomesVisiveis(fx.ctx.semVinculo)).toEqual([]);
  });
});

describe("RLS: tabelas só do administrador", () => {
  it("integração (credenciais) não é visível a empresa nem cliente", async () => {
    const [criada] = await withScope(fx.ctx.admin, (tx) =>
      tx
        .insert(integracao)
        .values({
          empresaId: fx.ids.empresaA,
          erp: "sienge",
          nome: `Sienge ${fx.tag}`,
          endereco: "exemplo",
          credenciaisEnc: "v1.segredo.criptografado",
        })
        .returning({ id: integracao.id }),
    );
    expect(criada).toBeDefined();

    for (const quem of ["empresaA", "clienteA", "empresaB", "semVinculo"] as const) {
      const rows = await withScope(fx.ctx[quem], (tx) =>
        tx.select({ id: integracao.id }).from(integracao).where(eq(integracao.id, criada!.id)),
      );
      expect(rows, quem).toEqual([]);
    }
    const doAdmin = await withScope(fx.ctx.admin, (tx) =>
      tx.select({ id: integracao.id }).from(integracao).where(eq(integracao.id, criada!.id)),
    );
    expect(doAdmin).toHaveLength(1);

    await getDb().delete(integracao).where(eq(integracao.id, criada!.id));
  });
});

describe("Auditoria é append-only", () => {
  it("administrador insere e lê; ninguém altera ou apaga pelo papel do app", async () => {
    await withScope(fx.ctx.admin, (tx) =>
      tx.insert(auditoria).values({
        empresaId: fx.ids.empresaA,
        usuarioId: fx.ids.admin,
        acao: "criar",
        entidade: "obra",
        resumo: `teste ${fx.tag}`,
      }),
    );

    const lidas = await withScope(fx.ctx.admin, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.empresaId, fx.ids.empresaA)),
    );
    expect(lidas.length).toBeGreaterThanOrEqual(1);

    await falhaCom(
      withScope(fx.ctx.admin, (tx) => tx.update(auditoria).set({ resumo: "adulterado" }).where(eq(auditoria.empresaId, fx.ids.empresaA))),
      /permission denied/,
    );
    await falhaCom(
      withScope(fx.ctx.admin, (tx) => tx.delete(auditoria).where(eq(auditoria.empresaId, fx.ids.empresaA))),
      /permission denied/,
    );
  });

  it("empresa e cliente não leem nem escrevem auditoria", async () => {
    for (const quem of ["empresaA", "clienteA"] as const) {
      const rows = await withScope(fx.ctx[quem], (tx) => tx.select().from(auditoria));
      expect(rows, quem).toEqual([]);
      await falhaCom(
        withScope(fx.ctx[quem], (tx) => tx.insert(auditoria).values({ acao: "criar", entidade: "x" })),
        /row-level security/,
      );
    }
  });
});

describe("Integridade entre empresas (FKs compostas)", () => {
  const base = () => ({
    empresaId: fx.ids.empresaA,
    obraId: fx.obraId["A-1"],
    categoriaId: fx.categoriaId.A,
    tipo: "custo" as const,
    valorCentavos: 500,
    dataCompetencia: "2026-03-01",
  });

  it("lançamento não pode usar categoria de outra empresa", async () => {
    await falhaCom(
      getDb().insert(lancamento).values({ ...base(), categoriaId: fx.categoriaId.B }),
      /lancamento_categoria_fk/,
    );
  });

  it("lançamento não pode apontar obra de outra empresa", async () => {
    await falhaCom(
      getDb().insert(lancamento).values({ ...base(), obraId: fx.obraId["B-1"] }),
      /lancamento_obra_empresa_fk/,
    );
  });

  it("etapa, lançamento e orçamento respeitam a obra da etapa", async () => {
    const [etapaA2] = await getDb()
      .insert(etapa)
      .values({ empresaId: fx.ids.empresaA, obraId: fx.obraId["A-2"], codigo: "01", nome: "Fundação" })
      .returning({ id: etapa.id });

    // Etapa da obra A-2 usada num lançamento da obra A-1: inválido.
    await falhaCom(
      getDb().insert(lancamento).values({ ...base(), etapaId: etapaA2!.id }),
      /lancamento_etapa_fk/,
    );
    await falhaCom(
      getDb().insert(orcamento).values({
        empresaId: fx.ids.empresaA,
        obraId: fx.obraId["A-1"],
        etapaId: etapaA2!.id,
        valorPrevistoCentavos: 1000,
      }),
      /orcamento_etapa_fk/,
    );
    // Etapa-pai de outra obra: inválido.
    await falhaCom(
      getDb().insert(etapa).values({
        empresaId: fx.ids.empresaA,
        obraId: fx.obraId["A-1"],
        paiId: etapaA2!.id,
        codigo: "01.1",
        nome: "Filha",
      }),
      /etapa_pai_fk/,
    );
  });
});

describe("Constraints de valor e data", () => {
  it("lançamento não aceita valor zero", async () => {
    await falhaCom(
      getDb().insert(lancamento).values({
        empresaId: fx.ids.empresaA,
        obraId: fx.obraId["A-1"],
        categoriaId: fx.categoriaId.A,
        tipo: "custo",
        valorCentavos: 0,
        dataCompetencia: "2026-03-01",
      }),
      /lancamento_valor_nao_zero/,
    );
  });

  it("orçamento não aceita valor negativo", async () => {
    await falhaCom(
      getDb().insert(orcamento).values({
        empresaId: fx.ids.empresaA,
        obraId: fx.obraId["A-1"],
        valorPrevistoCentavos: -1,
      }),
      /orcamento_valor_nao_negativo/,
    );
  });

  it("avanço físico: percentual 0–100% e competência no dia 1", async () => {
    const base = {
      empresaId: fx.ids.empresaA,
      obraId: fx.obraId["A-1"],
      tipo: "planejado" as const,
    };
    await falhaCom(
      getDb().insert(avancoFisico).values({ ...base, competencia: "2026-03-01", pctMesBps: 10_001 }),
      /avanco_pct_mes_faixa/,
    );
    await falhaCom(
      getDb().insert(avancoFisico).values({ ...base, competencia: "2026-03-15", pctMesBps: 100 }),
      /avanco_competencia_dia_1/,
    );
  });

  it("guarda centavos grandes sem perder precisão (bigint)", async () => {
    const grande = 9_007_199_254_740_000; // perto de 2^53, ainda inteiro seguro
    const [l] = await getDb()
      .insert(lancamento)
      .values({
        empresaId: fx.ids.empresaA,
        obraId: fx.obraId["A-1"],
        categoriaId: fx.categoriaId.A,
        tipo: "receita",
        valorCentavos: grande,
        dataCompetencia: "2026-03-01",
      })
      .returning({ valor: lancamento.valorCentavos, id: lancamento.id });
    expect(l?.valor).toBe(grande);
  });
});

describe("Idempotência por id_origem", () => {
  const dados = (idOrigem: string | null, valor = 1000) => ({
    empresaId: fx.ids.empresaA,
    obraId: fx.obraId["A-1"],
    categoriaId: fx.categoriaId.A,
    tipo: "custo" as const,
    valorCentavos: valor,
    dataCompetencia: "2026-04-01",
    origem: "planilha" as const,
    idOrigem,
  });

  it("não permite duas linhas com o mesmo id_origem na mesma origem", async () => {
    await getDb().insert(lancamento).values(dados(`dup-${fx.tag}`));
    await falhaCom(getDb().insert(lancamento).values(dados(`dup-${fx.tag}`)), /lancamento_origem_uidx|unique/);
  });

  it("linhas sem id_origem (lançamento manual) podem se repetir", async () => {
    await getDb().insert(lancamento).values(dados(null));
    await getDb().insert(lancamento).values(dados(null));
  });

  it("upsert atualiza a linha existente em vez de duplicar", async () => {
    const chave = `up-${fx.tag}`;
    const upsert = (valor: number) =>
      getDb().execute(sql`
        insert into lancamento
          (empresa_id, obra_id, categoria_id, tipo, valor_centavos, data_competencia, origem, id_origem)
        values
          (${fx.ids.empresaA}, ${fx.obraId["A-1"]}, ${fx.categoriaId.A}, 'custo', ${valor}, '2026-04-01', 'planilha', ${chave})
        on conflict (empresa_id, origem, (coalesce(integracao_id, '00000000-0000-0000-0000-000000000000'::uuid)), id_origem)
          where id_origem is not null
        do update set valor_centavos = excluded.valor_centavos, updated_at = now()`);

    await upsert(1000);
    await upsert(2500);

    const rows = await getDb()
      .select({ valor: lancamento.valorCentavos })
      .from(lancamento)
      .where(eq(lancamento.idOrigem, chave));
    expect(rows).toEqual([{ valor: 2500 }]);
  });
});
