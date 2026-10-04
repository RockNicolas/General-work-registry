import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { member, obraAcesso, organization, user } from "@/server/db/schema";
import { buildContext, type AppContext } from "./context";

/**
 * Carrega do banco os vínculos do usuário e monta o AppContext. Roda com a conexão do dono
 * (não é uma consulta de domínio): é daqui que sai o escopo usado por withScope().
 * Usuário inexistente ou banido, e empresas inativas, não concedem acesso.
 */
export async function loadContext(userId: string): Promise<AppContext | null> {
  const db = getDb();

  const [u] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!u || u.banned) return null;

  const memberships = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), or(isNull(organization.ativo), eq(organization.ativo, true))));

  const acessos = await db
    .select({ obraId: obraAcesso.obraId, empresaId: obraAcesso.empresaId })
    .from(obraAcesso)
    .where(eq(obraAcesso.usuarioId, userId));

  return buildContext({ user: u, memberships, acessos });
}
