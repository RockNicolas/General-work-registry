import { describe, expect, it } from "vitest";
import { buildContext } from "./context";

const user = { id: "u1", name: "Fulano", email: "fulano@exemplo.com" };

describe("buildContext", () => {
  it("administrador: isAdmin e perfil admin, independentemente de vínculos", () => {
    const ctx = buildContext({ user: { ...user, role: "admin" }, memberships: [], acessos: [] });
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.perfil).toBe("admin");
  });

  it("aceita lista de papéis separada por vírgula", () => {
    const ctx = buildContext({ user: { ...user, role: "user,admin" }, memberships: [], acessos: [] });
    expect(ctx.isAdmin).toBe(true);
  });

  it("empresa: enxerga as empresas em que tem papel empresa", () => {
    const ctx = buildContext({
      user: { ...user, role: "user" },
      memberships: [{ organizationId: "A", role: "empresa" }],
      acessos: [],
    });
    expect(ctx.perfil).toBe("empresa");
    expect(ctx.empresaIds).toEqual(["A"]);
    expect(ctx.membroEmpresaIds).toEqual(["A"]);
    expect(ctx.obraIds).toEqual([]);
  });

  it("cliente: só as obras liberadas, sem ver a empresa inteira", () => {
    const ctx = buildContext({
      user: { ...user, role: "user" },
      memberships: [{ organizationId: "A", role: "cliente" }],
      acessos: [{ obraId: "o1", empresaId: "A" }],
    });
    expect(ctx.perfil).toBe("cliente");
    expect(ctx.empresaIds).toEqual([]);
    expect(ctx.membroEmpresaIds).toEqual(["A"]);
    expect(ctx.obraIds).toEqual(["o1"]);
  });

  it("ignora liberação de obra de empresa em que o usuário não é mais cliente", () => {
    const ctx = buildContext({
      user: { ...user, role: "user" },
      memberships: [{ organizationId: "A", role: "cliente" }],
      acessos: [
        { obraId: "o1", empresaId: "A" },
        { obraId: "o9", empresaId: "B" },
      ],
    });
    expect(ctx.obraIds).toEqual(["o1"]);
  });

  it("mistura: empresa em A e cliente em B", () => {
    const ctx = buildContext({
      user: { ...user, role: "user" },
      memberships: [
        { organizationId: "A", role: "empresa" },
        { organizationId: "B", role: "cliente" },
      ],
      acessos: [{ obraId: "ob", empresaId: "B" }],
    });
    expect(ctx.perfil).toBe("empresa");
    expect(ctx.empresaIds).toEqual(["A"]);
    expect([...ctx.membroEmpresaIds].sort()).toEqual(["A", "B"]);
    expect(ctx.obraIds).toEqual(["ob"]);
  });

  it("sem vínculo algum: sem_acesso", () => {
    const ctx = buildContext({ user: { ...user, role: "user" }, memberships: [], acessos: [] });
    expect(ctx.perfil).toBe("sem_acesso");
    expect(ctx.membroEmpresaIds).toEqual([]);
  });

  it("papel de membro desconhecido não concede acesso", () => {
    const ctx = buildContext({
      user: { ...user, role: "user" },
      memberships: [{ organizationId: "A", role: "owner" }],
      acessos: [],
    });
    expect(ctx.perfil).toBe("sem_acesso");
  });
});
