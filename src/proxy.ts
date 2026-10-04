import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirecionamento otimista pela presença do cookie de sessão. NÃO é a barreira de segurança:
 * cada página, Server Action e Route Handler valida a sessão de verdade (requireContext).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const temSessao = Boolean(getSessionCookie(request));
  const emLogin = pathname === "/login";

  if (!temSessao && !emLogin) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (temSessao && emLogin) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Fora do proxy: API (auth, health, webhooks têm autenticação própria), assets e arquivos estáticos.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
