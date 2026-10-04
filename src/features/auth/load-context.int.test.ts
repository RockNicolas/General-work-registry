import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getPool } from "@/server/db/client";
import { organization, user } from "@/server/db/schema";
import { createTenantFixture, type TenantFixture } from "@/test/fixtures";
import { loadContext } from "./load-context";

let fx: TenantFixture;

beforeAll(async () => {
  fx = await createTenantFixture();
});

afterAll(async () => {
  await fx?.cleanup();
  await getPool().end();
});

describe("loadContext", () => {
  it("administrador", async () => {
    const ctx = await loadContext(fx.ids.admin);
    expect(ctx?.perfil).toBe("admin");
    expect(ctx?.isAdmin).toBe(true);
  });

  it("empresa: enxerga a própria empresa inteira", async () => {
    const ctx = await loadContext(fx.ids.userEmpresaA);
    expect(ctx?.perfil).toBe("empresa");
    expect(ctx?.empresaIds).toEqual([fx.ids.empresaA]);
    expect(ctx?.obraIds).toEqual([]);
  });

  it("cliente: só a obra liberada", async () => {
    const ctx = await loadContext(fx.ids.userClienteA);
    expect(ctx?.perfil).toBe("cliente");
    expect(ctx?.empresaIds).toEqual([]);
    expect(ctx?.obraIds).toEqual([fx.obraId["A-1"]]);
  });

  it("usuário sem vínculo: sem_acesso", async () => {
    expect((await loadContext(fx.ids.userSemVinculo))?.perfil).toBe("sem_acesso");
  });

  it("usuário inexistente: null", async () => {
    expect(await loadContext("nao-existe")).toBeNull();
  });

  it("usuário banido: null", async () => {
    await getDb().update(user).set({ banned: true }).where(eq(user.id, fx.ids.userEmpresaB));
    expect(await loadContext(fx.ids.userEmpresaB)).toBeNull();
    await getDb().update(user).set({ banned: false }).where(eq(user.id, fx.ids.userEmpresaB));
    expect((await loadContext(fx.ids.userEmpresaB))?.perfil).toBe("empresa");
  });

  it("empresa inativa não concede acesso", async () => {
    await getDb().update(organization).set({ ativo: false }).where(eq(organization.id, fx.ids.empresaA));
    expect((await loadContext(fx.ids.userEmpresaA))?.perfil).toBe("sem_acesso");
    expect((await loadContext(fx.ids.userClienteA))?.perfil).toBe("sem_acesso");
    await getDb().update(organization).set({ ativo: true }).where(eq(organization.id, fx.ids.empresaA));
    expect((await loadContext(fx.ids.userEmpresaA))?.perfil).toBe("empresa");
  });
});
