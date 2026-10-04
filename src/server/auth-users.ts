import { getAuth } from "./auth";

export type UsuarioCredencial = {
  email: string;
  name: string;
  password: string;
  role: "admin" | "user";
};

/**
 * Cria (ou promove) um usuário com e-mail/senha SEM passar pelo cadastro público, que está
 * desligado. Usado pelo bootstrap do primeiro administrador e pelo seed.
 * Se o e-mail já existe, apenas ajusta o papel global; a senha existente é mantida.
 */
export async function upsertUsuarioCredencial(
  input: UsuarioCredencial,
): Promise<{ id: string; criado: boolean }> {
  const ctx = await getAuth().$context;
  const email = input.email.trim().toLowerCase();

  const existente = await ctx.internalAdapter.findUserByEmail(email);
  if (existente) {
    // `role` vem do plugin admin e não aparece no tipo base do usuário.
    const roleAtual = (existente.user as { role?: string | null }).role;
    if (roleAtual !== input.role) {
      await ctx.internalAdapter.updateUser(existente.user.id, { role: input.role });
    }
    return { id: existente.user.id, criado: false };
  }

  const criado = await ctx.internalAdapter.createUser(
    { email, name: input.name, emailVerified: true, role: input.role },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: criado.id,
    providerId: "credential",
    accountId: criado.id,
    password: await ctx.password.hash(input.password),
  });
  return { id: criado.id, criado: true };
}
