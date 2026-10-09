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

  it("empresa analisa, importa Excel e integra; não governa", () => {
    expect(can({ perfil: "empresa" }, "ver", "dashboard")).toBe(true);
    expect(can({ perfil: "empresa" }, "ver", "importacao")).toBe(true);
    expect(can({ perfil: "empresa" }, "importar", "importacao")).toBe(true);
    expect(can({ perfil: "empresa" }, "ver", "integracao")).toBe(true);
    expect(can({ perfil: "empresa" }, "sincronizar", "integracao")).toBe(true);
    expect(can({ perfil: "empresa" }, "criar", "integracao")).toBe(true);
    expect(can({ perfil: "empresa" }, "ver", "empresa")).toBe(false);
    expect(can({ perfil: "empresa" }, "ver", "usuario")).toBe(false);
    expect(can({ perfil: "empresa" }, "ver", "auditoria")).toBe(false);
    expect(can({ perfil: "empresa" }, "criar", "obra")).toBe(false);
    expect(can({ perfil: "empresa" }, "importar", "lancamento")).toBe(false);
  });

  it("cliente só lê as análises", () => {
    expect(can({ perfil: "cliente" }, "ver", "dashboard")).toBe(true);
    expect(can({ perfil: "cliente" }, "ver", "obra")).toBe(true);
    expect(can({ perfil: "cliente" }, "exportar", "relatorio")).toBe(true);
    expect(can({ perfil: "cliente" }, "ver", "importacao")).toBe(false);
    expect(can({ perfil: "cliente" }, "importar", "importacao")).toBe(false);
    expect(can({ perfil: "cliente" }, "ver", "integracao")).toBe(false);
    expect(can({ perfil: "cliente" }, "sincronizar", "integracao")).toBe(false);
    expect(can({ perfil: "cliente" }, "ver", "usuario")).toBe(false);
    expect(can({ perfil: "cliente" }, "criar", "obra")).toBe(false);
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
