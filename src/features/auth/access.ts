import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

/**
 * Papéis dentro de uma empresa (member.role). Ambos são somente leitura: nenhuma permissão
 * de gestão da organização. Quem cria/edita é o Administrador, papel global (user.role = "admin").
 */
export const ac = createAccessControl(defaultStatements);

export const orgRoles = {
  empresa: ac.newRole({}),
  cliente: ac.newRole({}),
};

export type OrgRole = keyof typeof orgRoles;
