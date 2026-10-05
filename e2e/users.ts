/** Dados fixos do e2e. Criados (de forma idempotente) por e2e/global-setup.ts. */
export const E2E = {
  senha: "E2e-Senha-Forte-123",
  empresa: { id: "e2e-empresa", nome: "E2E Empresa", slug: "e2e-empresa" },
  /** Segunda empresa, para provar que os perfis não enxergam uma à outra. */
  outraEmpresa: { id: "e2e-outra", nome: "E2E Outra Empresa", slug: "e2e-outra" },
  obras: {
    a1: { codigo: "E2E-A1", nome: "Obra Visível A1" },
    a2: { codigo: "E2E-A2", nome: "Obra Reservada A2" },
    b1: { codigo: "E2E-B1", nome: "Obra Da Outra B1" },
  },
  /** Integração com o Sienge falso (src/test/fake-sienge.ts), criada pelo global-setup na empresa fixa. */
  integracao: { id: "e2e00000-0000-4000-8000-000000000001", nome: "E2E Sienge Fake", obraErp: { id: "101", nome: "Empreendimento E2E Cem e Um" } },
  admin: { email: "e2e-admin@rgo.test", nome: "Ana Admin", membro: null },
  empresaUser: { email: "e2e-empresa@rgo.test", nome: "Eva Empresa", membro: "empresa" as const },
  /** Cliente da E2E Empresa com acesso só à obra A1. */
  clienteUser: { email: "e2e-cliente@rgo.test", nome: "Caio Cliente", membro: "cliente" as const },
  semVinculo: { email: "e2e-sem-vinculo@rgo.test", nome: "Sem Vinculo", membro: null },
} as const;
