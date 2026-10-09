import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "@/server/auth";
import type { AppContext } from "./context";
import { loadContext } from "./load-context";
import { can, type Action, type Resource } from "./policies";

/** O banco fica nos EUA: sessão + vínculos são algumas idas de ~100 ms. Vale por um minuto. */
const CONTEXTO_MS = 60_000;
const contextoPorToken = new Map<string, { ate: number; ctx: AppContext | null }>();

function tokenDaSessao(cookie: string | null): string | null {
  if (!cookie) return null;
  const m = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/.exec(cookie);
  return m?.[1] ?? null;
}

/** Contexto do usuário logado, ou null. Memoizado por requisição e, por pouco tempo, entre cliques. */
export const getContextOrNull = cache(async (): Promise<AppContext | null> => {
  const h = await headers();
  const token = tokenDaSessao(h.get("cookie"));
  const agora = Date.now();
  if (token) {
    const hit = contextoPorToken.get(token);
    if (hit && hit.ate > agora) return hit.ctx;
  }

  const session = await getAuth().api.getSession({ headers: h });
  if (!session) return null;
  const ctx = await loadContext(session.user.id);
  if (token) contextoPorToken.set(token, { ate: agora + CONTEXTO_MS, ctx });
  return ctx;
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

/** Para telas que um perfil não-admin também abre (importação, integração). Sem permissão, 404. */
export async function requirePode(action: Action, resource: Resource): Promise<AppContext> {
  const ctx = await requireContext();
  if (!can(ctx, action, resource)) notFound();
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
