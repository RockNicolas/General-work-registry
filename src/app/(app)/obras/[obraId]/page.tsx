import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireContext } from "@/features/auth/session";
import { obterObra } from "@/features/obras/queries";
import { resumoObra } from "@/features/obras/service";
import { formatDateBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

export const metadata = { title: "Obra — RGO" };

function Kpi({ titulo, valor, descricao }: { titulo: string; valor: string; descricao?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{titulo}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{valor}</CardTitle>
      </CardHeader>
      {descricao && <CardContent className="text-xs text-muted-foreground">{descricao}</CardContent>}
    </Card>
  );
}

export default async function ObraResumoPage({ params }: PageProps<"/obras/[obraId]">) {
  const { obraId } = await params;
  const ctx = await requireContext();
  const [obra, r] = await Promise.all([obterObra(ctx, obraId), resumoObra(ctx, obraId)]);
  if (!obra) notFound();

  const margem = r.receitaRealizadaCentavos - r.custoRealizadoCentavos;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="Orçamento vigente" valor={formatBRL(r.orcamentoCentavos)} descricao={`${r.totalEtapas} etapa(s)`} />
        <Kpi titulo="Custo realizado" valor={formatBRL(r.custoRealizadoCentavos)} descricao="Pago, operacional" />
        <Kpi
          titulo="Custo comprometido"
          valor={formatBRL(r.custoComprometidoCentavos)}
          descricao="Pago + a pagar, operacional"
        />
        <Kpi titulo="Receita realizada" valor={formatBRL(r.receitaRealizadaCentavos)} descricao={`Margem realizada: ${formatBRL(margem)}`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dados da obra</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ["Empresa", obra.empresaNome],
              ["Código", obra.codigo],
              ["Local", [obra.cidade, obra.uf].filter(Boolean).join("/") || "—"],
              ["Início", obra.dataInicio ? formatDateBR(obra.dataInicio) : "—"],
              ["Fim previsto", obra.dataFimPrevista ? formatDateBR(obra.dataFimPrevista) : "—"],
              ["Lançamentos", String(r.totalLancamentos)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b pb-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
