import { Building2, FileUp, HardHat, History, LayoutDashboard, type LucideIcon, Plug, Shield, Tags, Users } from "lucide-react";
import type { AppContext } from "@/features/auth/context";
import { can, type Resource } from "@/features/auth/policies";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Recurso exigido para ver o item (matriz em features/auth/policies.ts). */
  resource: Resource;
  /** Cadastro que só o administrador faz (obra, cliente, categoria). */
  somenteAdmin?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

// Cada fase acrescenta aqui as telas que entrega. Só aparece o que já existe.
const NAV: NavGroup[] = [
  {
    label: "Painel da empresa",
    items: [
      { title: "Análises", href: "/dashboard", icon: LayoutDashboard, resource: "dashboard" },
      { title: "Importar Excel", href: "/importacoes", icon: FileUp, resource: "importacao" },
      { title: "Integração", href: "/admin/integracoes", icon: Plug, resource: "integracao" },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Administradores", href: "/admin/administradores", icon: Shield, resource: "usuario", somenteAdmin: true },
      { title: "Empresas", href: "/admin/empresas", icon: Building2, resource: "empresa", somenteAdmin: true },
      { title: "Clientes", href: "/admin/clientes", icon: Users, resource: "usuario", somenteAdmin: true },
      { title: "Obras", href: "/obras", icon: HardHat, resource: "obra", somenteAdmin: true },
      { title: "Categorias", href: "/admin/categorias", icon: Tags, resource: "empresa", somenteAdmin: true },
      { title: "Auditoria", href: "/admin/auditoria", icon: History, resource: "auditoria", somenteAdmin: true },
    ],
  },
];

/** Slug quando a URL é de uma empresa (`/e/construtora-aurora/...`). */
export function slugNaUrl(pathname: string): string | null {
  const m = /^\/e\/([^/]+)/.exec(pathname);
  return m?.[1] ?? null;
}

/** Dentro da URL da empresa, análises/obras/planilha/integração apontam para ela. */
export function hrefNaEmpresa(href: string, slug: string | null): string {
  if (!slug) return href;
  if (href === "/dashboard" || href === "/a") return `/e/${slug}`;
  if (href === "/obras") return `/e/${slug}/obras`;
  if (href === "/importacoes") return `/e/${slug}/importacoes`;
  if (href === "/admin/integracoes") return `/e/${slug}/integracao`;
  return href;
}

/** Título do item de menu da rota, para a tela de carregamento. */
export function tituloDaRota(pathname: string): string {
  const slug = slugNaUrl(pathname);
  const path = slug ? pathname.slice(`/e/${slug}`.length) || "/" : pathname;
  if (pathname === "/a") return "Administração";
  if (slug && (path === "/" || path === "")) return "Análises";
  if (slug && (path === "/obras" || path.startsWith("/obras/"))) return "Obras";
  if (slug && path.startsWith("/importacoes")) return "Importar Excel";
  if (slug && path.startsWith("/integracao")) return "Integração";
  const item = NAV.flatMap((g) => g.items).find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return item?.title ?? "Carregando";
}

/** Itens que o perfil pode ver; grupos vazios somem. */
export function navFor(ctx: Pick<AppContext, "perfil">): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items
      .filter((i) => {
        if (i.somenteAdmin && ctx.perfil !== "admin") return false;
        return can(ctx, "ver", i.resource);
      })
      .map((i) => (ctx.perfil === "admin" && i.href === "/dashboard" ? { ...i, href: "/a" } : i)),
  })).filter((g) => g.items.length > 0);
}
