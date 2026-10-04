import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppContext } from "@/features/auth/context";
import { createTenantFixture, type TenantFixture } from "@/test/fixtures";
import { getDb, getPool } from "./client";
import { describeError } from "./migrate";
import { obra, obraAcesso, organization } from "./schema";
import { withScope } from "./scope";

let fx: TenantFixture;

beforeAll(async () => {
  fx = await createTenantFixture();
});

afterAll(async () => {
  await fx?.cleanup();
  await getPool().end();
});

/** Códigos das obras da fixture que o contexto consegue ler. */
async function obrasVisiveis(ctx: AppContext): Promise<string[]> {
  const rows = await withScope(ctx, (tx) =>
    tx.select({ codigo: obra.codigo }).from(obra).where(inArray(obra.id, fx.todasObras)),
  );
  return rows.map((r) => r.codigo).sort();
}

async function falhaCom(promise: Promise<unknown>, padrao: RegExp) {
  try {
    await promise;
  } catch (error) {
    expect(describeError(error)).toMatch(padrao);
    return;
  }
  throw new Error(`Esperava falha com ${padrao}, mas a operação passou`);
}

describe("RLS: leitura de obras", () => {
  it("administrador enxerga todas as empresas", async () => {
    expect(await obrasVisiveis(fx.ctx.admin)).toEqual(["A-1", "A-2", "B-1"]);
  });

  it("empresa A enxerga só as obras de A (nunca as de B)", async () => {
    expect(await obrasVisiveis(fx.ctx.empresaA)).toEqual(["A-1", "A-2"]);
  });

  it("empresa B enxerga só as obras de B", async () => {
    expect(await obrasVisiveis(fx.ctx.empresaB)).toEqual(["B-1"]);
  });

  it("cliente de A enxerga só a obra liberada", async () => {
    expect(await obrasVisiveis(fx.ctx.clienteA)).toEqual(["A-1"]);
  });

  it("usuário sem vínculo não enxerga nada", async () => {
    expect(await obrasVisiveis(fx.ctx.semVinculo)).toEqual([]);
  });

  it("sem escopo algum (variáveis ausentes), o banco nega tudo", async () => {
    const rows = await getDb().transaction(async (tx) => {
      await tx.execute(sql`set local role rgo_app`);
      return tx.select({ id: obra.id }).from(obra).where(inArray(obra.id, fx.todasObras));
    });
    expect(rows).toEqual([]);
  });

  it("ignorar o filtro da aplicação não vaza: SELECT sem WHERE continua isolado", async () => {
    const rows = await withScope(fx.ctx.empresaA, (tx) => tx.select({ empresaId: obra.empresaId }).from(obra));
    expect(rows.every((r) => r.empresaId === fx.ids.empresaA)).toBe(true);
  });

  it("acesso direto por id de outra empresa devolve vazio", async () => {
    const rows = await withScope(fx.ctx.empresaA, (tx) =>
      tx.select().from(obra).where(eq(obra.id, fx.obraId["B-1"])),
    );
    expect(rows).toEqual([]);
  });
});

describe("RLS: empresas (organization)", () => {
  const idsDaFixture = () => [fx.ids.empresaA, fx.ids.empresaB];
  const visiveis = async (ctx: AppContext) =>
    (
      await withScope(ctx, (tx) =>
        tx.select({ id: organization.id }).from(organization).where(inArray(organization.id, idsDaFixture())),
      )
    )
      .map((r) => r.id)
      .sort();

  it("administrador vê todas", async () => {
    expect(await visiveis(fx.ctx.admin)).toEqual([fx.ids.empresaA, fx.ids.empresaB].sort());
  });

  it("empresa e cliente veem só a própria empresa", async () => {
    expect(await visiveis(fx.ctx.empresaA)).toEqual([fx.ids.empresaA]);
    expect(await visiveis(fx.ctx.clienteA)).toEqual([fx.ids.empresaA]);
    expect(await visiveis(fx.ctx.empresaB)).toEqual([fx.ids.empresaB]);
  });

  it("sem vínculo não vê empresa nenhuma", async () => {
    expect(await visiveis(fx.ctx.semVinculo)).toEqual([]);
  });
});

describe("RLS: escrita só do administrador", () => {
  it.each(["empresaA", "clienteA", "empresaB", "semVinculo"] as const)(
    "%s não consegue inserir obra",
    async (quem) => {
      await falhaCom(
        withScope(fx.ctx[quem], (tx) =>
          tx.insert(obra).values({ empresaId: fx.ids.empresaA, codigo: `X-${quem}`, nome: "Invasora" }),
        ),
        /row-level security/,
      );
    },
  );

  it("empresa não altera nem exclui obra da própria empresa (0 linhas afetadas)", async () => {
    const atualizadas = await withScope(fx.ctx.empresaA, (tx) =>
      tx.update(obra).set({ nome: "Hackeada" }).where(eq(obra.id, fx.obraId["A-1"])).returning({ id: obra.id }),
    );
    const excluidas = await withScope(fx.ctx.empresaA, (tx) =>
      tx.delete(obra).where(eq(obra.id, fx.obraId["A-1"])).returning({ id: obra.id }),
    );
    expect(atualizadas).toEqual([]);
    expect(excluidas).toEqual([]);

    const [intacta] = await getDb().select().from(obra).where(eq(obra.id, fx.obraId["A-1"]));
    expect(intacta?.nome).toBe("Obra A1");
  });

  it("empresa não altera obra de outra empresa", async () => {
    const atualizadas = await withScope(fx.ctx.empresaA, (tx) =>
      tx.update(obra).set({ nome: "Hackeada" }).where(eq(obra.id, fx.obraId["B-1"])).returning({ id: obra.id }),
    );
    expect(atualizadas).toEqual([]);
  });

  it("administrador insere, altera e exclui", async () => {
    const [criada] = await withScope(fx.ctx.admin, (tx) =>
      tx
        .insert(obra)
        .values({ empresaId: fx.ids.empresaB, codigo: "B-ADMIN", nome: "Criada pelo admin" })
        .returning({ id: obra.id }),
    );
    expect(criada).toBeDefined();

    const [alterada] = await withScope(fx.ctx.admin, (tx) =>
      tx.update(obra).set({ nome: "Renomeada" }).where(eq(obra.id, criada!.id)).returning({ nome: obra.nome }),
    );
    expect(alterada?.nome).toBe("Renomeada");

    const excluidas = await withScope(fx.ctx.admin, (tx) =>
      tx.delete(obra).where(eq(obra.id, criada!.id)).returning({ id: obra.id }),
    );
    expect(excluidas).toHaveLength(1);
  });
});

describe("RLS: vínculos de obra (obra_acesso) são só do administrador", () => {
  it("cliente não lê a tabela de vínculos", async () => {
    const rows = await withScope(fx.ctx.clienteA, (tx) => tx.select().from(obraAcesso));
    expect(rows).toEqual([]);
  });

  it("administrador lê", async () => {
    const rows = await withScope(fx.ctx.admin, (tx) =>
      tx.select().from(obraAcesso).where(eq(obraAcesso.usuarioId, fx.ids.userClienteA)),
    );
    expect(rows).toHaveLength(1);
  });
});

describe("Privilégios do papel rgo_app", () => {
  it.each(["account", '"user"', "session", "member", "invitation", "verification"])(
    "não acessa a tabela %s (hash de senha, tokens, vínculos)",
    async (tabela) => {
      await falhaCom(
        withScope(fx.ctx.admin, (tx) => tx.execute(sql.raw(`select * from ${tabela} limit 1`))),
        /permission denied/,
      );
    },
  );
});

describe("Integridade entre empresas (FK composta)", () => {
  it("não permite vincular obra de A a uma liberação marcada como empresa B", async () => {
    await falhaCom(
      getDb().insert(obraAcesso).values({
        usuarioId: fx.ids.userEmpresaB,
        obraId: fx.obraId["A-1"],
        empresaId: fx.ids.empresaB,
      }),
      /obra_acesso_obra_empresa_fk|foreign key/,
    );
  });
});

describe("withScope", () => {
  it("não deixa escopo nem papel vazarem para a próxima consulta no mesmo pool", async () => {
    await withScope(fx.ctx.admin, (tx) => tx.select({ id: obra.id }).from(obra).limit(1));

    const resultado = await getDb().execute(
      sql`select current_user as papel, coalesce(current_setting('app.is_admin', true), '') as is_admin`,
    );
    const linha = resultado.rows[0] as { papel: string; is_admin: string };
    expect(linha.papel).not.toBe("rgo_app");
    expect(linha.is_admin).not.toBe("true");

    // E um novo escopo vazio não herda nada do admin anterior.
    expect(await obrasVisiveis(fx.ctx.semVinculo)).toEqual([]);
  });

  it("rejeita ids que poderiam forjar outros escopos (vírgula)", async () => {
    const forjado: AppContext = { ...fx.ctx.semVinculo, empresaIds: [`${fx.ids.empresaA},${fx.ids.empresaB}`] };
    await expect(withScope(forjado, async () => 1)).rejects.toThrow(/Id inválido/);
  });
});
