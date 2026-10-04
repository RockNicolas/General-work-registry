import { LayoutDashboard, type LucideIcon } from "lucide-react";
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
    items: [{ title: "Visão geral", href: "/dashboard", icon: LayoutDashboard, resource: "dashboard" }],
  },
];

/** Itens que o perfil pode ver; grupos vazios somem. */
export function navFor(ctx: Pick<AppContext, "perfil">): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(ctx, "ver", i.resource)) })).filter(
    (g) => g.items.length > 0,
  );
}
