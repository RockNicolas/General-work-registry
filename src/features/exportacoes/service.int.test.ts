import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registrarAuditoria } from "@/features/auditoria/registrar";
import { filtrosLancamentoSchema } from "@/features/lancamentos/schema";
import { listarLancamentosParaExportar } from "@/features/lancamentos/service";
import { getDb, getPool } from "@/server/db/client";
import { auditoria, lancamento } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { type TenantFixture, createTenantFixture } from "@/test/fixtures";
import { registrarExportacao } from "./service";

let fx: TenantFixture;

beforeAll(async () => {
  fx = await createTenantFixture();
  // Conjunto controlado em A-1: 4 lançamentos (a fixture já trouxe 1 em cada obra).
  const A1 = fx.obraId["A-1"];
  const base = { empresaId: fx.ids.empresaA, obraId: A1, categoriaId: fx.categoriaId.A } as const;
  await getDb().insert(lancamento).values([
    { ...base, tipo: "custo", valorCentavos: 20_000, dataCompetencia: "2026-02-10", descricao: "export alfa" },
    { ...base, tipo: "custo", valorCentavos: 30_000, dataCompetencia: "2026-03-10", descricao: "export beta", situacao: "a_realizar" },
    { ...base, tipo: "receita", valorCentavos: 90_000, dataCompetencia: "2026-03-15", descricao: "export gama" },
  ]);
});

afterAll(async () => {
  await getDb().delete(auditoria).where(like(auditoria.resumo, `%${fx.tag}%`)); // o evento sem empresa não é limpo pela fixture
  await fx?.cleanup();
  await getPool().end();
});

const filtros = (extra: Record<string, string> = {}) => filtrosLancamentoSchema.parse(extra);
const registrosDe = (empresaId: string) => getDb().select().from(auditoria).where(and(eq(auditoria.empresaId, empresaId), eq(auditoria.acao, "exportar")));

describe("auditoria de exportação (qualquer perfil que exporta)", () => {
  it("administrador, usuário da empresa e cliente registram em nome da própria empresa", async () => {
    for (const [quem, ctx] of [["admin", fx.ctx.admin], ["empresa", fx.ctx.empresaA], ["cliente", fx.ctx.clienteA]] as const) {
      await registrarExportacao(ctx, { empresaId: fx.ids.empresaA, entidade: "painel", resumo: `Painel exportado por ${quem}`, depois: { formato: "xlsx" } });
    }
    const rows = await registrosDe(fx.ids.empresaA);
    expect(rows.map((r) => r.resumo).sort()).toEqual(["Painel exportado por admin", "Painel exportado por cliente", "Painel exportado por empresa"]);
    // Fica registrado QUEM exportou.
    expect(rows.find((r) => r.resumo?.endsWith("empresa"))).toMatchObject({ usuarioId: fx.ids.userEmpresaA, entidade: "painel", acao: "exportar" });
  });

  it("consolidado (sem empresa) também é aceito", async () => {
    await registrarExportacao(fx.ctx.empresaA, { empresaId: null, entidade: "painel", resumo: `consolidado ${fx.tag}` });
    const [r] = await getDb().select().from(auditoria).where(eq(auditoria.resumo, `consolidado ${fx.tag}`));
    expect(r).toMatchObject({ empresaId: null, acao: "exportar" });
  });

  it("ninguém registra exportação em nome de empresa de que não é membro", async () => {
    await expect(registrarExportacao(fx.ctx.empresaA, { empresaId: fx.ids.empresaB, entidade: "painel", resumo: "forjado" })).rejects.toThrow();
    await expect(registrarExportacao(fx.ctx.semVinculo, { empresaId: fx.ids.empresaA, entidade: "painel", resumo: "forjado" })).rejects.toThrow();
    expect((await registrosDe(fx.ids.empresaB)).filter((r) => r.resumo === "forjado")).toEqual([]);
  });

  it("a abertura é só para 'exportar': nenhum outro evento passa pela política (nem de uma empresa própria)", async () => {
    for (const acao of ["criar", "editar", "excluir", "importar", "sincronizar"] as const) {
      await expect(
        withScope(fx.ctx.empresaA, (tx) => registrarAuditoria(tx, fx.ctx.empresaA, { acao, entidade: "obra", empresaId: fx.ids.empresaA, resumo: `forjado ${acao}` })),
        acao,
      ).rejects.toThrow();
    }
    const forjados = await getDb().select().from(auditoria).where(and(eq(auditoria.empresaId, fx.ids.empresaA), inArray(auditoria.acao, ["criar", "editar", "excluir", "importar", "sincronizar"])));
    expect(forjados).toEqual([]);
  });

  it("quem não é administrador continua sem poder LER a auditoria", async () => {
    const lidos = await withScope(fx.ctx.empresaA, (tx) => tx.select().from(auditoria).where(eq(auditoria.empresaId, fx.ids.empresaA)));
    expect(lidos).toEqual([]);
    const doAdmin = await withScope(fx.ctx.admin, (tx) => tx.select().from(auditoria).where(eq(auditoria.empresaId, fx.ids.empresaA)));
    expect(doAdmin.length).toBeGreaterThan(0);
  });
});

describe("listarLancamentosParaExportar", () => {
  it("traz todos os lançamentos da obra, sem paginar, com totais", async () => {
    const r = await listarLancamentosParaExportar(fx.ctx.admin, fx.obraId["A-1"], filtros());
    expect(r.excedeLimite).toBe(false);
    expect(r.total).toBe(4); // 1 da fixture + 3
    expect(r.rows).toHaveLength(4);
    expect(r.somaCustoCentavos).toBe(100_000 + 20_000 + 30_000);
    expect(r.somaReceitaCentavos).toBe(90_000);
    expect(r.rows[0]).toMatchObject({ categoriaNome: "Cimento", etapaLabel: null });
  });

  it("aplica os mesmos filtros da lista (tipo, situação, período, busca)", async () => {
    const A1 = fx.obraId["A-1"];
    expect((await listarLancamentosParaExportar(fx.ctx.admin, A1, filtros({ tipo: "receita" }))).rows.map((x) => x.descricao)).toEqual(["export gama"]);
    expect((await listarLancamentosParaExportar(fx.ctx.admin, A1, filtros({ situacao: "a_realizar" }))).rows.map((x) => x.descricao)).toEqual(["export beta"]);
    expect((await listarLancamentosParaExportar(fx.ctx.admin, A1, filtros({ de: "2026-03-01", ate: "2026-03-31" }))).total).toBe(2);
    expect((await listarLancamentosParaExportar(fx.ctx.admin, A1, filtros({ q: "ALFA" }))).rows.map((x) => x.descricao)).toEqual(["export alfa"]);
  });

  it("ordem: competência mais recente primeiro", async () => {
    const r = await listarLancamentosParaExportar(fx.ctx.admin, fx.obraId["A-1"], filtros({ de: "2026-02-01" }));
    expect(r.rows.map((x) => x.dataCompetencia)).toEqual(["2026-03-15", "2026-03-10", "2026-02-10"]);
  });

  it("acima do limite não devolve linhas: pede para refinar (e informa o total)", async () => {
    const r = await listarLancamentosParaExportar(fx.ctx.admin, fx.obraId["A-1"], filtros(), 3);
    expect(r).toMatchObject({ excedeLimite: true, total: 4, rows: [] });
    expect((await listarLancamentosParaExportar(fx.ctx.admin, fx.obraId["A-1"], filtros(), 4)).excedeLimite).toBe(false); // exatamente no limite ainda passa
  });

  it("isolamento: empresa de A exporta A-1; cliente só A-1; ninguém exporta obra alheia", async () => {
    expect((await listarLancamentosParaExportar(fx.ctx.empresaA, fx.obraId["A-1"], filtros())).total).toBe(4);
    expect((await listarLancamentosParaExportar(fx.ctx.clienteA, fx.obraId["A-1"], filtros())).total).toBe(4);
    // A obra A-2 é da empresa A, mas o cliente só tem a A-1 liberada.
    expect(await listarLancamentosParaExportar(fx.ctx.clienteA, fx.obraId["A-2"], filtros())).toMatchObject({ total: 0, rows: [] });
    // B-1 é de outra empresa.
    expect(await listarLancamentosParaExportar(fx.ctx.empresaA, fx.obraId["B-1"], filtros())).toMatchObject({ total: 0, rows: [] });
    expect(await listarLancamentosParaExportar(fx.ctx.empresaB, fx.obraId["A-1"], filtros())).toMatchObject({ total: 0, rows: [] });
    expect(await listarLancamentosParaExportar(fx.ctx.semVinculo, fx.obraId["A-1"], filtros())).toMatchObject({ total: 0, rows: [] });
  });
});
