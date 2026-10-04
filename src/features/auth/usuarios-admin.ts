import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { registrarAuditoria } from "@/features/auditoria/registrar";
import type { AtualizarUsuarioInput, CriarUsuarioInput, PapelVinculo } from "@/features/usuarios/schema";
import { ActionError } from "@/lib/action-result";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { account, member, obra, obraAcesso, organization, session, user } from "@/server/db/schema";
import type { AppContext } from "./context";

/**
 * Gestão de usuários pelo Administrador. Mexe nas tabelas de auth (user/member/account/session),
 * que o papel de RLS não alcança, por isso usa a conexão do dono e fica restrito a este módulo.
 * Toda função aqui deve ser chamada só depois de confirmar que o contexto é de administrador.
 */

export type UsuarioRow = {
  id: string;
  nome: string;
  email: string;
  admin: boolean;
  ativo: boolean;
  criadoEm: string;
  vinculos: { empresaId: string; empresaNome: string; papel: PapelVinculo; obraIds: string[] }[];
};

export async function listarUsuarios(): Promise<UsuarioRow[]> {
  const db = getDb();
  const [usuarios, membros, acessos] = await Promise.all([
    db
      .select({
        id: user.id,
        nome: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        criadoEm: user.createdAt,
      })
      .from(user)
      .orderBy(asc(user.name)),
    db
      .select({
        userId: member.userId,
        empresaId: member.organizationId,
        papel: member.role,
        empresaNome: organization.name,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId)),
    db.select({ usuarioId: obraAcesso.usuarioId, obraId: obraAcesso.obraId, empresaId: obraAcesso.empresaId }).from(obraAcesso),
  ]);

  return usuarios.map((u) => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    admin: (u.role ?? "").split(",").includes("admin"),
    ativo: !u.banned,
    criadoEm: u.criadoEm.toISOString(),
    vinculos: membros
      .filter((m) => m.userId === u.id && (m.papel === "empresa" || m.papel === "cliente"))
      .map((m) => ({
        empresaId: m.empresaId,
        empresaNome: m.empresaNome,
        papel: m.papel as PapelVinculo,
        obraIds: acessos.filter((a) => a.usuarioId === u.id && a.empresaId === m.empresaId).map((a) => a.obraId),
      })),
  }));
}

type Vinculos = CriarUsuarioInput["vinculos"];
type Banco = Pick<ReturnType<typeof getDb>, "select" | "insert" | "delete" | "update">;

/** Confere que as empresas existem e que cada obra liberada pertence à empresa do vínculo. */
async function validarVinculos(tx: Banco, vinculos: Vinculos) {
  if (vinculos.length === 0) return;
  const empresaIds = vinculos.map((v) => v.empresaId);
  const existentes = await tx.select({ id: organization.id }).from(organization).where(inArray(organization.id, empresaIds));
  if (existentes.length !== new Set(empresaIds).size) throw new ActionError("Empresa inexistente.");

  const obraIds = vinculos.flatMap((v) => (v.papel === "cliente" ? v.obraIds : []));
  if (obraIds.length === 0) return;
  const obras = await tx.select({ id: obra.id, empresaId: obra.empresaId }).from(obra).where(inArray(obra.id, obraIds));
  const empresaDaObra = new Map(obras.map((o) => [o.id, o.empresaId]));
  for (const v of vinculos) {
    if (v.papel !== "cliente") continue;
    for (const id of v.obraIds) {
      if (empresaDaObra.get(id) !== v.empresaId) {
        throw new ActionError("Uma das obras liberadas não pertence à empresa informada.");
      }
    }
  }
}

/** Troca os vínculos do usuário (empresas e obras liberadas) pelos informados. */
async function gravarVinculos(tx: Banco, userId: string, admin: boolean, vinculos: Vinculos) {
  await tx.delete(obraAcesso).where(eq(obraAcesso.usuarioId, userId));
  await tx.delete(member).where(eq(member.userId, userId));
  if (admin) return; // Administrador não precisa de vínculo: enxerga tudo.

  const agora = new Date();
  if (vinculos.length > 0) {
    await tx.insert(member).values(
      vinculos.map((v) => ({
        id: crypto.randomUUID(),
        organizationId: v.empresaId,
        userId,
        role: v.papel,
        createdAt: agora,
      })),
    );
  }
  const acessos = vinculos.flatMap((v) =>
    v.papel === "cliente" ? [...new Set(v.obraIds)].map((obraId) => ({ usuarioId: userId, obraId, empresaId: v.empresaId })) : [],
  );
  if (acessos.length > 0) await tx.insert(obraAcesso).values(acessos);
}

export async function criarUsuario(ctx: AppContext, input: CriarUsuarioInput): Promise<{ id: string }> {
  const auth = await getAuth().$context;
  const email = input.email.trim().toLowerCase();

  if (await auth.internalAdapter.findUserByEmail(email)) {
    throw new ActionError("Este e-mail já está cadastrado.", { email: "E-mail já cadastrado" });
  }
  await validarVinculos(getDb(), input.admin ? [] : input.vinculos);

  const criado = await auth.internalAdapter.createUser(
    { email, name: input.nome, emailVerified: true, role: input.admin ? "admin" : "user", banned: !input.ativo },
    { method: "admin" },
  );

  try {
    await auth.internalAdapter.linkAccount({
      userId: criado.id,
      providerId: "credential",
      accountId: criado.id,
      password: await auth.password.hash(input.senha),
    });
    await getDb().transaction(async (tx) => {
      await gravarVinculos(tx, criado.id, input.admin, input.vinculos);
      await registrarAuditoria(tx, ctx, {
        acao: "criar",
        entidade: "usuario",
        entidadeId: criado.id,
        resumo: `Usuário criado: ${input.nome} (${email})`,
        depois: { email, admin: input.admin, ativo: input.ativo, vinculos: input.vinculos },
      });
    });
  } catch (error) {
    // Sem transação entre o Better Auth e o nosso banco: desfaz o usuário para não deixar meio-criado.
    await getDb().delete(user).where(eq(user.id, criado.id)).catch(() => undefined);
    throw error;
  }
  return { id: criado.id };
}

async function adminsAtivosAlemDe(tx: Banco, userId: string): Promise<number> {
  const rows = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(user)
    .where(and(ne(user.id, userId), eq(user.role, "admin"), eq(user.banned, false)));
  return rows[0]?.n ?? 0;
}

export async function atualizarUsuario(ctx: AppContext, id: string, input: AtualizarUsuarioInput): Promise<void> {
  const email = input.email.trim().toLowerCase();

  await getDb().transaction(async (tx) => {
    const [antes] = await tx.select().from(user).where(eq(user.id, id));
    if (!antes) throw new ActionError("Usuário não encontrado.");

    const eraAdmin = (antes.role ?? "").split(",").includes("admin");
    if (id === ctx.userId && (!input.admin || !input.ativo)) {
      throw new ActionError("Você não pode remover seu próprio acesso de administrador nem se desativar.");
    }
    if (eraAdmin && (!input.admin || !input.ativo) && (await adminsAtivosAlemDe(tx, id)) === 0) {
      throw new ActionError("Precisa existir ao menos um administrador ativo.");
    }

    const duplicado = await tx.select({ id: user.id }).from(user).where(and(eq(user.email, email), ne(user.id, id)));
    if (duplicado.length > 0) throw new ActionError("Este e-mail já está cadastrado.", { email: "E-mail já cadastrado" });

    await validarVinculos(tx, input.admin ? [] : input.vinculos);

    await tx
      .update(user)
      .set({ name: input.nome, email, role: input.admin ? "admin" : "user", banned: !input.ativo, banReason: null })
      .where(eq(user.id, id));
    if (!input.ativo) await tx.delete(session).where(eq(session.userId, id)); // derruba sessões abertas

    await gravarVinculos(tx, id, input.admin, input.vinculos);

    await registrarAuditoria(tx, ctx, {
      acao: "editar",
      entidade: "usuario",
      entidadeId: id,
      resumo: `Usuário editado: ${input.nome} (${email})`,
      antes: { email: antes.email, role: antes.role, banned: antes.banned },
      depois: { email, admin: input.admin, ativo: input.ativo, vinculos: input.vinculos },
    });
  });
}

export async function redefinirSenha(ctx: AppContext, id: string, senha: string): Promise<void> {
  const auth = await getAuth().$context;
  const hash = await auth.password.hash(senha);

  await getDb().transaction(async (tx) => {
    const [alvo] = await tx.select({ id: user.id, nome: user.name, email: user.email }).from(user).where(eq(user.id, id));
    if (!alvo) throw new ActionError("Usuário não encontrado.");

    const atualizadas = await tx
      .update(account)
      .set({ password: hash })
      .where(and(eq(account.userId, id), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (atualizadas.length === 0) throw new ActionError("Este usuário não tem login por senha.");

    await tx.delete(session).where(eq(session.userId, id)); // obriga a entrar de novo
    await registrarAuditoria(tx, ctx, {
      acao: "editar",
      entidade: "usuario",
      entidadeId: id,
      resumo: `Senha redefinida: ${alvo.nome} (${alvo.email})`,
    });
  });
}
