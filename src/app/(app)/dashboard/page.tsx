import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireContext } from "@/features/auth/session";

export const metadata = { title: "Visão geral — RGO" };

const PERFIL_TEXTO = {
  admin: "Você acessa todas as empresas e obras e gerencia o sistema.",
  empresa: "Você vê as obras e os dashboards das suas empresas, em modo leitura.",
  cliente: "Você vê apenas as obras às quais foi vinculado, em modo leitura.",
  sem_acesso: "",
} as const;

export default async function DashboardPage() {
  const ctx = await requireContext();

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {ctx.nome.split(" ")[0]}</h1>
        <p className="text-muted-foreground">{PERFIL_TEXTO[ctx.perfil]}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Visão geral</CardTitle>
          <CardDescription>
            Os indicadores de custo, receita e margem aparecerão aqui quando houver dados.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {ctx.isAdmin
            ? "Acesso total."
            : `${ctx.membroEmpresaIds.length} empresa(s)${
                ctx.perfil === "cliente" ? ` e ${ctx.obraIds.length} obra(s) liberada(s)` : ""
              }.`}
        </CardContent>
      </Card>
    </>
  );
}
