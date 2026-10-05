import { Building2, FileUp, HardHat, History, LayoutDashboard, type LucideIcon, Plug, Tags, Users } from "lucide-react";
import type { AppContext } from "@/features/auth/context";
import { can, type Resource } from "@/features/auth/policies";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Recurso exigido para ver o item (matriz em features/auth/policies.ts). */
  resource: Resource;
};

export type NavGroup = { label: string; items: NavItem[] };

// Cada fase acrescenta aqui as telas que entrega. Só aparece o que já existe.
const NAV: NavGroup[] = [
  {
    label: "Painel",
    items: [
      { title: "Visão geral", href: "/dashboard", icon: LayoutDashboard, resource: "dashboard" },
      { title: "Obras", href: "/obras", icon: HardHat, resource: "obra" },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Empresas", href: "/admin/empresas", icon: Building2, resource: "empresa" },
      { title: "Usuários", href: "/admin/usuarios", icon: Users, resource: "usuario" },
      { title: "Categorias", href: "/admin/categorias", icon: Tags, resource: "empresa" },
      { title: "Importações", href: "/importacoes", icon: FileUp, resource: "importacao" },
      { title: "Integrações", href: "/admin/integracoes", icon: Plug, resource: "integracao" },
      { title: "Auditoria", href: "/admin/auditoria", icon: History, resource: "auditoria" },
    ],
  },
];

/** Itens que o perfil pode ver; grupos vazios somem. */
export function navFor(ctx: Pick<AppContext, "perfil">): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(ctx, "ver", i.resource)) })).filter(
    (g) => g.items.length > 0,
  );
}
