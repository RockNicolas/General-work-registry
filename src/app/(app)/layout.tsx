import { AppSidebar } from "@/components/layout/app-sidebar";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireContext } from "@/features/auth/session";
import { SemAcesso } from "./sem-acesso";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireContext();

  if (ctx.perfil === "sem_acesso") {
    return <SemAcesso nome={ctx.nome} email={ctx.email} />;
  }

  return (
    <SidebarProvider>
      <AppSidebar perfil={ctx.perfil} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <UserMenu nome={ctx.nome} email={ctx.email} perfil={ctx.perfil} />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
