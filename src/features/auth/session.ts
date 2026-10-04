import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "@/server/auth";
import type { AppContext } from "./context";
import { loadContext } from "./load-context";

/** Contexto do usuário logado, ou null. Memoizado por requisição. */
export const getContextOrNull = cache(async (): Promise<AppContext | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  return loadContext(session.user.id);
});

/** Para páginas e Server Actions que exigem login. Sem sessão válida, vai para /login. */
export async function requireContext(): Promise<AppContext> {
  const ctx = await getContextOrNull();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Para áreas exclusivas do Administrador. Quem não é admin recebe 404 (não revela a existência). */
export async function requireAdmin(): Promise<AppContext> {
  const ctx = await requireContext();
  if (!ctx.isAdmin) notFound();
  return ctx;
}

/**
 * Para Server Actions: devolve o contexto se o usuário é administrador, senão null.
 * Actions não redirecionam nem dão 404; respondem com erro tratável pelo formulário.
 */
export async function getAdminContextOrNull(): Promise<AppContext | null> {
  const ctx = await getContextOrNull();
  return ctx?.isAdmin ? ctx : null;
}
