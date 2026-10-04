import { describe, expect, it } from "vitest";
import { can, canAccessEmpresa, canAccessObra, type Action, type Resource } from "./policies";

const ACTIONS: Action[] = ["ver", "criar", "editar", "excluir", "importar", "sincronizar", "exportar"];
const RESOURCES: Resource[] = [
  "dashboard",
  "obra",
  "lancamento",
  "orcamento",
  "relatorio",
  "empresa",
  "usuario",
  "importacao",
  "integracao",
  "auditoria",
];

describe("can", () => {
  it("administrador pode tudo", () => {
    for (const a of ACTIONS) for (const r of RESOURCES) expect(can({ perfil: "admin" }, a, r)).toBe(true);
  });

  it.each(["empresa", "cliente"] as const)("%s nunca escreve nem gerencia", (perfil) => {
    for (const r of RESOURCES) {
      for (const a of ["criar", "editar", "excluir", "importar", "sincronizar"] as Action[]) {
        expect(can({ perfil }, a, r), `${perfil} ${a} ${r}`).toBe(false);
      }
    }
  });

  it.each(["empresa", "cliente"] as const)("%s só enxerga o que é de leitura", (perfil) => {
    expect(can({ perfil }, "ver", "dashboard")).toBe(true);
    expect(can({ perfil }, "ver", "obra")).toBe(true);
    expect(can({ perfil }, "ver", "lancamento")).toBe(true);
    expect(can({ perfil }, "ver", "orcamento")).toBe(true);
    expect(can({ perfil }, "ver", "relatorio")).toBe(true);
    expect(can({ perfil }, "exportar", "relatorio")).toBe(true);

    expect(can({ perfil }, "ver", "usuario")).toBe(false);
    expect(can({ perfil }, "ver", "empresa")).toBe(false);
    expect(can({ perfil }, "ver", "importacao")).toBe(false);
    expect(can({ perfil }, "ver", "integracao")).toBe(false);
    expect(can({ perfil }, "ver", "auditoria")).toBe(false);
    expect(can({ perfil }, "exportar", "lancamento")).toBe(false);
  });

  it("sem_acesso não pode nada", () => {
    for (const a of ACTIONS) for (const r of RESOURCES) expect(can({ perfil: "sem_acesso" }, a, r)).toBe(false);
  });
});

describe("canAccessEmpresa / canAccessObra", () => {
  const admin = { isAdmin: true, membroEmpresaIds: [], empresaIds: [], obraIds: [] };
  const empresaA = { isAdmin: false, membroEmpresaIds: ["A"], empresaIds: ["A"], obraIds: [] };
  const clienteA = { isAdmin: false, membroEmpresaIds: ["A"], empresaIds: [], obraIds: ["o1"] };

  it("administrador acessa qualquer empresa e obra", () => {
    expect(canAccessEmpresa(admin, "Z")).toBe(true);
    expect(canAccessObra(admin, { id: "x", empresaId: "Z" })).toBe(true);
  });

  it("empresa acessa só as próprias obras", () => {
    expect(canAccessEmpresa(empresaA, "A")).toBe(true);
    expect(canAccessEmpresa(empresaA, "B")).toBe(false);
    expect(canAccessObra(empresaA, { id: "o1", empresaId: "A" })).toBe(true);
    expect(canAccessObra(empresaA, { id: "o2", empresaId: "B" })).toBe(false);
  });

  it("cliente acessa só as obras liberadas", () => {
    expect(canAccessEmpresa(clienteA, "A")).toBe(true);
    expect(canAccessObra(clienteA, { id: "o1", empresaId: "A" })).toBe(true);
    expect(canAccessObra(clienteA, { id: "o2", empresaId: "A" })).toBe(false);
  });
});
