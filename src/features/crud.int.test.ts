import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sanitizar } from "@/features/auditoria/registrar";
import { listarAuditoria } from "@/features/auditoria/service";
import { atualizarUsuario, criarUsuario, listarUsuarios, redefinirSenha } from "@/features/auth/usuarios-admin";
import { listarCategorias, criarCategoriasPadrao, CATEGORIAS_PADRAO } from "@/features/categorias/service";
import { atualizarEmpresa, criarEmpresa, listarEmpresas } from "@/features/empresas/service";
import { atualizarEtapa, criarEtapa, excluirEtapa, listarEtapas } from "@/features/etapas/service";
import { atualizarLancamento, criarLancamento, excluirLancamento, listarLancamentos } from "@/features/lancamentos/service";
import { filtrosLancamentoSchema } from "@/features/lancamentos/schema";
import { atualizarObra, buscarObra, criarObra, excluirObra, listarObras, resumoObra } from "@/features/obras/service";
import { criarOrcamento, atualizarOrcamento, listarOrcamento } from "@/features/orcamento/service";
import { ActionError } from "@/lib/action-result";
import { getDb, getPool } from "@/server/db/client";
import { friendlyDbError } from "@/server/db/errors";
import { account, auditoria, categoria, lancamento, member, organization, session, user } from "@/server/db/schema";
import { createTenantFixture, type TenantFixture } from "@/test/fixtures";

let fx: TenantFixture;
const empresasCriadas: string[] = [];

beforeAll(async () => {
  fx = await createTenantFixture();
});

afterAll(async () => {
  const db = getDb();
  if (empresasCriadas.length) {
    await db.delete(auditoria).where(inArray(auditoria.empresaId, empresasCriadas));
    await db.delete(organization).where(inArray(organization.id, empresasCriadas));
  }
  await db.delete(auditoria).where(like(auditoria.resumo, `%${fx.tag}%`)); // eventos sem empresa (usuários)
  await db.delete(user).where(like(user.email, `${fx.tag}-%`));
  await fx?.cleanup();
  await getPool().end();
});

const admin = () => fx.ctx.admin;

async function erroDe(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error("Esperava uma falha, mas a operação passou");
}

describe("Empresas", () => {
  it("cria com slug único, normaliza o CNPJ e registra auditoria", async () => {
    const a = await criarEmpresa(admin(), { nome: `Construtora São José ${fx.tag}`, razaoSocial: "", cnpj: "11.222.333/0001-81", ativo: true });
    const b = await criarEmpresa(admin(), { nome: `Construtora São José ${fx.tag}`, razaoSocial: "Razão", cnpj: "", ativo: true });
    empresasCriadas.push(a.id, b.id);

    const lista = await listarEmpresas(admin());
    const ea = lista.find((e) => e.id === a.id)!;
    const eb = lista.find((e) => e.id === b.id)!;
    expect(ea.cnpj).toBe("11222333000181");
    expect(ea.slug).toMatch(/^construtora-sao-jose-/);
    expect(eb.slug).toBe(`${ea.slug}-2`);

    const eventos = await listarAuditoria(admin());
    expect(eventos.some((e) => e.entidade === "empresa" && e.resumo?.includes(`Construtora São José ${fx.tag}`))).toBe(true);
  });

  it("edita e desativa", async () => {
    const [e] = empresasCriadas;
    await atualizarEmpresa(admin(), e!, { nome: `Renomeada ${fx.tag}`, razaoSocial: "", cnpj: "", ativo: false });
    const lista = await listarEmpresas(admin());
    expect(lista.find((x) => x.id === e)).toMatchObject({ nome: `Renomeada ${fx.tag}`, ativo: false, cnpj: null });
  });

  it("empresa e cliente não conseguem criar empresa (RLS) e a mensagem é amigável", async () => {
    const erro = await erroDe(criarEmpresa(fx.ctx.empresaA, { nome: `Invasora ${fx.tag}`, razaoSocial: "", cnpj: "", ativo: true }));
    expect(friendlyDbError(erro)).toBe("Sem permissão para esta operação.");
  });

  it("cada perfil lista só as empresas a que pertence", async () => {
    const ids = [fx.ids.empresaA, fx.ids.empresaB];
    const visiveis = async (ctx: typeof fx.ctx.admin) => (await listarEmpresas(ctx)).map((e) => e.id).filter((id) => ids.includes(id));
    expect((await visiveis(admin())).sort()).toEqual(ids.sort());
    expect(await visiveis(fx.ctx.empresaA)).toEqual([fx.ids.empresaA]);
    expect(await visiveis(fx.ctx.clienteA)).toEqual([fx.ids.empresaA]);
    expect(await visiveis(fx.ctx.semVinculo)).toEqual([]);
  });
});

describe("Obras", () => {
  const dados = (codigo: string, empresaId = () => fx.ids.empresaA) => ({
    empresaId: empresaId(),
    codigo,
    nome: `Obra ${codigo}`,
    status: "ativa" as const,
    dataInicio: "2026-01-01",
    dataFimPrevista: "2027-01-01",
    cidade: "Campinas",
    uf: "SP",
  });

  it("cria, edita e não permite mudar de empresa", async () => {
    const { id } = await criarObra(admin(), dados("T-100"));
    const criada = await buscarObra(admin(), id);
    expect(criada).toMatchObject({ codigo: "T-100", empresaId: fx.ids.empresaA, status: "ativa", uf: "SP" });

    await atualizarObra(admin(), id, { ...dados("T-100"), nome: "Renomeada", status: "pausada" });
    expect(await buscarObra(admin(), id)).toMatchObject({ nome: "Renomeada", status: "pausada" });

    const erro = await erroDe(atualizarObra(admin(), id, { ...dados("T-100"), empresaId: fx.ids.empresaB }));
    expect(erro).toBeInstanceOf(ActionError);
  });

  it("código repetido na mesma empresa dá mensagem amigável; em outra empresa pode", async () => {
    await criarObra(admin(), dados("T-200"));
    const erro = await erroDe(criarObra(admin(), dados("T-200")));
    expect(friendlyDbError(erro)).toBe("Já existe uma obra com este código nesta empresa.");
    await criarObra(admin(), { ...dados("T-200"), empresaId: fx.ids.empresaB });
  });

  it("obra com lançamentos não pode ser excluída; vazia pode", async () => {
    const erro = await erroDe(excluirObra(admin(), fx.obraId["A-1"]));
    expect(erro).toBeInstanceOf(ActionError);
    expect((erro as Error).message).toMatch(/lançamento/);

    const { id } = await criarObra(admin(), dados("T-300"));
    await excluirObra(admin(), id);
    expect(await buscarObra(admin(), id)).toBeNull();
  });

  it("cada perfil lista e abre só as obras permitidas", async () => {
    const codigos = async (ctx: typeof fx.ctx.admin) =>
      (await listarObras(ctx)).filter((o) => fx.todasObras.includes(o.id)).map((o) => o.codigo).sort();
    expect(await codigos(admin())).toEqual(["A-1", "A-2", "B-1"]);
    expect(await codigos(fx.ctx.empresaA)).toEqual(["A-1", "A-2"]);
    expect(await codigos(fx.ctx.clienteA)).toEqual(["A-1"]);
    expect(await codigos(fx.ctx.empresaB)).toEqual(["B-1"]);

    expect(await buscarObra(fx.ctx.empresaA, fx.obraId["B-1"])).toBeNull();
    expect(await buscarObra(fx.ctx.clienteA, fx.obraId["A-2"])).toBeNull();
    expect(await buscarObra(fx.ctx.clienteA, fx.obraId["A-1"])).not.toBeNull();
    expect(await buscarObra(admin(), "isso-nao-e-uuid")).toBeNull();
  });

  it("resumo da obra soma só o que é operacional e o que o perfil enxerga", async () => {
    const r = await resumoObra(fx.ctx.empresaA, fx.obraId["A-1"]);
    expect(r.totalLancamentos).toBe(1);
    expect(r.custoRealizadoCentavos).toBe(100_000);
    // Outra empresa não vê nada da obra A-1.
    const vazio = await resumoObra(fx.ctx.empresaB, fx.obraId["A-1"]);
    expect(vazio.totalLancamentos).toBe(0);
    expect(vazio.custoRealizadoCentavos).toBe(0);
  });
});

describe("Etapas", () => {
  it("cria hierarquia, ordena de forma natural e bloqueia ciclos", async () => {
    const obraId = fx.obraId["A-2"];
    const base = { obraId, paiId: "" };
    const e10 = await criarEtapa(admin(), { ...base, codigo: "1.10", nome: "Dez" });
    const e2 = await criarEtapa(admin(), { ...base, codigo: "1.2", nome: "Dois" });
    const raiz = await criarEtapa(admin(), { ...base, codigo: "1", nome: "Raiz" });
    await atualizarEtapa(admin(), e2.id, { obraId, codigo: "1.2", nome: "Dois", paiId: raiz.id });
    await atualizarEtapa(admin(), e10.id, { obraId, codigo: "1.10", nome: "Dez", paiId: e2.id });

    const lista = await listarEtapas(admin(), obraId);
    expect(lista.map((e) => e.codigo)).toEqual(["1", "1.2", "1.10"]);
    expect(lista.map((e) => e.nivel)).toEqual([0, 1, 2]);

    // Raiz tentando virar filha da própria neta: ciclo.
    const ciclo = await erroDe(atualizarEtapa(admin(), raiz.id, { obraId, codigo: "1", nome: "Raiz", paiId: e10.id }));
    expect(ciclo).toBeInstanceOf(ActionError);
    // E de si mesma.
    const propria = await erroDe(atualizarEtapa(admin(), raiz.id, { obraId, codigo: "1", nome: "Raiz", paiId: raiz.id }));
    expect(propria).toBeInstanceOf(ActionError);

    // Etapa com filha não pode ser excluída (mensagem amigável).
    const erro = await erroDe(excluirEtapa(admin(), raiz.id));
    expect(friendlyDbError(erro)).toBe("Não é possível excluir: existem registros vinculados a este item.");
  });

  it("outra empresa não vê as etapas", async () => {
    expect(await listarEtapas(fx.ctx.empresaB, fx.obraId["A-2"])).toEqual([]);
  });
});

describe("Orçamento", () => {
  it("cria, edita e só mexe em itens manuais", async () => {
    const obraId = fx.obraId["A-1"];
    const base = { obraId, etapaId: "", categoriaId: fx.categoriaId.A, descricao: "Estrutura", valorPrevistoCentavos: 500_000_00, versao: 1, vigente: true };
    const { id } = await criarOrcamento(admin(), base);
    await atualizarOrcamento(admin(), id, { ...base, valorPrevistoCentavos: 600_000_00 });
    const itens = await listarOrcamento(admin(), obraId);
    expect(itens.find((i) => i.id === id)).toMatchObject({ valorPrevistoCentavos: 600_000_00, origem: "manual", categoriaNome: "Cimento" });

    // Item de planilha: edição manual é recusada.
    const [daPlanilha] = await getDb()
      .insert((await import("@/server/db/schema")).orcamento)
      .values({ empresaId: fx.ids.empresaA, obraId, valorPrevistoCentavos: 1000, origem: "planilha", idOrigem: `x-${fx.tag}` })
      .returning({ id: (await import("@/server/db/schema")).orcamento.id });
    const erro = await erroDe(atualizarOrcamento(admin(), daPlanilha!.id, { ...base, valorPrevistoCentavos: 5 }));
    expect(erro).toBeInstanceOf(ActionError);
  });

  it("não aceita categoria de outra empresa", async () => {
    const erro = await erroDe(
      criarOrcamento(admin(), { obraId: fx.obraId["A-1"], etapaId: "", categoriaId: fx.categoriaId.B, descricao: "", valorPrevistoCentavos: 1, versao: 1, vigente: true }),
    );
    expect(friendlyDbError(erro)).toMatch(/Referência inválida/);
  });
});

describe("Lançamentos", () => {
  const novo = (extra: Partial<Parameters<typeof criarLancamento>[1]> = {}) => ({
    obraId: fx.obraId["A-1"],
    tipo: "custo" as const,
    situacao: "realizado" as const,
    classe: "operacional" as const,
    isPrevisao: false,
    valorCentavos: 12_345_67,
    dataCompetencia: "2026-02-10",
    dataVencimento: "",
    dataLiquidacao: "2026-02-12",
    categoriaId: fx.categoriaId.A,
    etapaId: "",
    contraparte: "Cimento Forte",
    documento: "NF 99",
    descricao: "Cimento CP-II",
    ...extra,
  });

  it("cria manual, filtra, busca por texto e pagina", async () => {
    const { id } = await criarLancamento(admin(), novo());
    await criarLancamento(admin(), novo({ tipo: "receita", contraparte: "Contratante", descricao: "Medição", valorCentavos: 900_000_00 }));
    await criarLancamento(admin(), novo({ situacao: "a_realizar", dataLiquidacao: "", dataVencimento: "2026-12-01", contraparte: "Fornecedor 100%_" }));

    const todos = await listarLancamentos(admin(), fx.obraId["A-1"], filtrosLancamentoSchema.parse({}));
    expect(todos.total).toBe(4); // 1 da fixture + 3
    expect(todos.somaReceitaCentavos).toBe(900_000_00);

    const soCusto = await listarLancamentos(admin(), fx.obraId["A-1"], filtrosLancamentoSchema.parse({ tipo: "custo", situacao: "a_realizar" }));
    expect(soCusto.total).toBe(1);

    const busca = await listarLancamentos(admin(), fx.obraId["A-1"], filtrosLancamentoSchema.parse({ q: "cp-ii" }));
    expect(busca.rows.map((r) => r.id)).toContain(id);

    // % e _ são tratados como texto, não como curinga.
    const curinga = await listarLancamentos(admin(), fx.obraId["A-1"], filtrosLancamentoSchema.parse({ q: "100%_" }));
    expect(curinga.total).toBe(1);

    const periodo = await listarLancamentos(admin(), fx.obraId["A-1"], filtrosLancamentoSchema.parse({ de: "2026-02-01", ate: "2026-02-28" }));
    expect(periodo.rows.every((r) => r.dataCompetencia.startsWith("2026-02"))).toBe(true);

    const pagina99 = await listarLancamentos(admin(), fx.obraId["A-1"], filtrosLancamentoSchema.parse({ pagina: "99" }));
    expect(pagina99.pagina).toBe(pagina99.totalPaginas); // fora do intervalo vira a última
  });

  it("edita e exclui manual; recusa os de planilha/ERP", async () => {
    const { id } = await criarLancamento(admin(), novo({ descricao: "para editar" }));
    await atualizarLancamento(admin(), id, novo({ descricao: "editado", valorCentavos: 5_00 }));
    const pag = await listarLancamentos(admin(), fx.obraId["A-1"], filtrosLancamentoSchema.parse({ q: "editado" }));
    expect(pag.rows[0]).toMatchObject({ descricao: "editado", valorCentavos: 5_00 });
    await excluirLancamento(admin(), id);

    const [importado] = await getDb()
      .insert(lancamento)
      .values({
        empresaId: fx.ids.empresaA, obraId: fx.obraId["A-1"], categoriaId: fx.categoriaId.A, tipo: "custo",
        valorCentavos: 100, dataCompetencia: "2026-02-01", origem: "planilha", idOrigem: `imp-${fx.tag}`,
      })
      .returning({ id: lancamento.id });
    expect(await erroDe(atualizarLancamento(admin(), importado!.id, novo()))).toBeInstanceOf(ActionError);
    expect(await erroDe(excluirLancamento(admin(), importado!.id))).toBeInstanceOf(ActionError);
  });

  it("cliente só lista lançamentos da obra liberada", async () => {
    const liberada = await listarLancamentos(fx.ctx.clienteA, fx.obraId["A-1"], filtrosLancamentoSchema.parse({}));
    expect(liberada.total).toBeGreaterThan(0);
    const bloqueada = await listarLancamentos(fx.ctx.clienteA, fx.obraId["A-2"], filtrosLancamentoSchema.parse({}));
    expect(bloqueada.total).toBe(0);
    const outraEmpresa = await listarLancamentos(fx.ctx.empresaA, fx.obraId["B-1"], filtrosLancamentoSchema.parse({}));
    expect(outraEmpresa.total).toBe(0);
  });
});

describe("Categorias", () => {
  it("aplica o conjunto padrão sem duplicar", async () => {
    const [empresaNova] = empresasCriadas;
    const primeira = await criarCategoriasPadrao(admin(), empresaNova!);
    expect(primeira.criadas).toBe(CATEGORIAS_PADRAO.length);
    const segunda = await criarCategoriasPadrao(admin(), empresaNova!);
    expect(segunda.criadas).toBe(0);
    const lista = await listarCategorias(admin(), empresaNova);
    expect(lista).toHaveLength(CATEGORIAS_PADRAO.length);
    await getDb().delete(categoria).where(eq(categoria.empresaId, empresaNova!));
  });
});

describe("Usuários", () => {
  const email = (n: string) => `${fx.tag}-${n}@teste.local`;

  it("cria cliente com obras, valida obra de outra empresa, e o login é por e-mail único", async () => {
    const criado = await criarUsuario(admin(), {
      nome: "Cliente Novo",
      email: email("cliente"),
      senha: "SenhaForte123",
      admin: false,
      ativo: true,
      vinculos: [{ empresaId: fx.ids.empresaA, papel: "cliente", obraIds: [fx.obraId["A-1"]] }],
    });

    const u = (await listarUsuarios()).find((x) => x.id === criado.id)!;
    expect(u).toMatchObject({ admin: false, ativo: true });
    expect(u.vinculos).toEqual([
      { empresaId: fx.ids.empresaA, empresaNome: `Empresa A ${fx.tag}`, papel: "cliente", obraIds: [fx.obraId["A-1"]] },
    ]);

    // A senha é guardada como hash (nunca em texto).
    const [conta] = await getDb().select({ senha: account.password }).from(account).where(eq(account.userId, criado.id));
    expect(conta?.senha).toBeTruthy();
    expect(conta?.senha).not.toContain("SenhaForte123");

    const duplicado = await erroDe(
      criarUsuario(admin(), { nome: "Outro", email: email("cliente").toUpperCase(), senha: "SenhaForte123", admin: true, ativo: true, vinculos: [] }),
    );
    expect((duplicado as Error).message).toMatch(/já está cadastrado/);

    const obraAlheia = await erroDe(
      criarUsuario(admin(), {
        nome: "Obra Alheia", email: email("alheia"), senha: "SenhaForte123", admin: false, ativo: true,
        vinculos: [{ empresaId: fx.ids.empresaA, papel: "cliente", obraIds: [fx.obraId["B-1"]] }],
      }),
    );
    expect((obraAlheia as Error).message).toMatch(/não pertence à empresa/);
    // E não deixou usuário meio-criado.
    expect((await getDb().select().from(user).where(eq(user.email, email("alheia")))).length).toBe(0);
  });

  it("não deixa o administrador se rebaixar nem remover o último administrador", async () => {
    const adminCriado = await criarUsuario(admin(), { nome: "Outro Admin", email: email("admin2"), senha: "SenhaForte123", admin: true, ativo: true, vinculos: [] });

    // O contexto 'admin' da fixture tenta se rebaixar.
    const eu = await erroDe(atualizarUsuario(admin(), fx.ids.admin, { nome: "admin", email: `${fx.ids.admin}@teste.local`, admin: false, ativo: true, vinculos: [{ empresaId: fx.ids.empresaA, papel: "empresa", obraIds: [] }] }));
    expect((eu as Error).message).toMatch(/seu próprio acesso/);

    // Outro admin ativo pode ser desativado enquanto existir pelo menos um outro admin ativo.
    await atualizarUsuario(admin(), adminCriado.id, { nome: "Outro Admin", email: email("admin2"), admin: true, ativo: false, vinculos: [] });
    const u = (await listarUsuarios()).find((x) => x.id === adminCriado.id)!;
    expect(u.ativo).toBe(false);
  });

  it("desativar derruba sessões; redefinir senha troca o hash e derruba sessões", async () => {
    const { id } = await criarUsuario(admin(), { nome: "Sessão", email: email("sessao"), senha: "SenhaForte123", admin: false, ativo: true, vinculos: [{ empresaId: fx.ids.empresaB, papel: "empresa", obraIds: [] }] });
    const abrirSessao = () =>
      getDb().insert(session).values({ id: crypto.randomUUID(), token: crypto.randomUUID(), userId: id, expiresAt: new Date(Date.now() + 3_600_000), updatedAt: new Date() });

    await abrirSessao();
    const [antes] = await getDb().select({ senha: account.password }).from(account).where(eq(account.userId, id));
    await redefinirSenha(admin(), id, "NovaSenhaForte456");
    const [depois] = await getDb().select({ senha: account.password }).from(account).where(eq(account.userId, id));
    expect(depois?.senha).not.toBe(antes?.senha);
    expect(await getDb().select().from(session).where(eq(session.userId, id))).toHaveLength(0);

    await abrirSessao();
    await atualizarUsuario(admin(), id, { nome: "Sessão", email: email("sessao"), admin: false, ativo: false, vinculos: [{ empresaId: fx.ids.empresaB, papel: "empresa", obraIds: [] }] });
    expect(await getDb().select().from(session).where(eq(session.userId, id))).toHaveLength(0);

    // Trocar vínculos substitui os anteriores.
    await atualizarUsuario(admin(), id, { nome: "Sessão", email: email("sessao"), admin: false, ativo: true, vinculos: [{ empresaId: fx.ids.empresaA, papel: "empresa", obraIds: [] }] });
    const vinculos = await getDb().select().from(member).where(and(eq(member.userId, id)));
    expect(vinculos.map((v) => v.organizationId)).toEqual([fx.ids.empresaA]);
  });
});

describe("Auditoria", () => {
  it("não grava campos sensíveis", () => {
    expect(sanitizar({ email: "a@b.c", senha: "123", nested: { token: "x", password: "y", ok: 1 }, lista: [{ credenciais: "z" }] })).toEqual({
      email: "a@b.c",
      senha: "[omitido]",
      nested: { token: "[omitido]", password: "[omitido]", ok: 1 },
      lista: [{ credenciais: "[omitido]" }],
    });
  });

  it("o histórico guarda a criação de obra com quem fez", async () => {
    const eventos = await listarAuditoria(admin());
    const obraCriada = eventos.find((e) => e.entidade === "obra" && e.resumo?.includes("T-100"));
    expect(obraCriada).toBeDefined();
    expect(obraCriada?.usuarioNome).toBe("admin");
  });

  it("empresa e cliente não enxergam a auditoria", async () => {
    expect(await listarAuditoria(fx.ctx.empresaA)).toEqual([]);
    expect(await listarAuditoria(fx.ctx.clienteA)).toEqual([]);
  });
});
