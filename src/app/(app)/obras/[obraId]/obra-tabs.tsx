"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "", label: "Resumo" },
  { href: "/etapas", label: "Etapas" },
  { href: "/orcamento", label: "Orçamento" },
  { href: "/lancamentos", label: "Lançamentos" },
  { href: "/avanco", label: "Avanço físico" },
];

export function ObraTabs({ obraId }: { obraId: string }) {
  const pathname = usePathname();
  const base = `/obras/${obraId}`;

  return (
    <nav aria-label="Seções da obra" className="-mb-px flex gap-1 overflow-x-auto border-b">
      {ABAS.map((aba) => {
        const href = base + aba.href;
        const ativa = aba.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={aba.label}
            href={href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              ativa
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {aba.label}
          </Link>
        );
      })}
      {/* Os indicadores desta obra vivem no painel, já filtrados por ela. */}
      <Link
        href={`/dashboard?obra=${obraId}`}
        className="ml-auto whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Painel da obra →
      </Link>
    </nav>
  );
}
