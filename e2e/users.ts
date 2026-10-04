/** Usuários fixos do e2e (um por perfil). Criados por e2e/global-setup.ts. */
export const E2E = {
  senha: "E2e-Senha-Forte-123",
  empresa: { id: "e2e-empresa", nome: "E2E Empresa", slug: "e2e-empresa" },
  admin: { email: "e2e-admin@rgo.test", nome: "Ana Admin", membro: null },
  empresaUser: { email: "e2e-empresa@rgo.test", nome: "Eva Empresa", membro: "empresa" as const },
  clienteUser: { email: "e2e-cliente@rgo.test", nome: "Caio Cliente", membro: "cliente" as const },
  semVinculo: { email: "e2e-sem-vinculo@rgo.test", nome: "Sem Vinculo", membro: null },
} as const;
