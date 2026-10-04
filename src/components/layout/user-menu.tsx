"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Perfil } from "@/features/auth/context";
import { authClient } from "@/lib/auth-client";

const PERFIL_LABEL: Record<Perfil, string> = {
  admin: "Administrador",
  empresa: "Empresa",
  cliente: "Cliente",
  sem_acesso: "Sem acesso",
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const [primeira, ultima] = [partes[0], partes.length > 1 ? partes[partes.length - 1] : undefined];
  return `${primeira?.[0] ?? "?"}${ultima?.[0] ?? ""}`.toUpperCase();
}

export function UserMenu({ nome, email, perfil }: { nome: string; email: string; perfil: Perfil }) {
  const router = useRouter();

  async function sair() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu do usuário"
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar>
          <AvatarFallback>{iniciais(nome)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="grid gap-1 font-normal">
          <span className="truncate text-sm font-medium">{nome}</span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
          <Badge variant="secondary" className="mt-1 w-fit">
            {PERFIL_LABEL[perfil]}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={sair}>
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
