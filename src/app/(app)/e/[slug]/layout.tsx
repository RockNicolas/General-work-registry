import Link from "next/link";
import type { ReactNode } from "react";
import { requireContext } from "@/features/auth/session";
import { empresaDaRota } from "@/features/empresas/rota";
import { URL_ADMIN } from "@/features/empresas/url";

export default async function EmpresaLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [empresa, ctx] = await Promise.all([empresaDaRota(slug), requireContext()]);
  if (!ctx.isAdmin) return children;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Painel de {empresa.nome}. O menu de administração segue disponível: obras, categorias, clientes e o restante do cadastro.{" "}
        <Link href={URL_ADMIN} className="underline underline-offset-4">
          Voltar para /a
        </Link>
      </p>
      {children}
    </>
  );
}
