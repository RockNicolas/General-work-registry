import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/money";
import { formatBps } from "@/lib/percent";
import { cn } from "@/lib/utils";
import type { Kpis } from "../queries";

function Kpi({ titulo, valor, detalhe, negativo }: { titulo: string; valor: string; detalhe: string; negativo?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{titulo}</CardDescription>
        <CardTitle className={cn("text-2xl tabular-nums", negativo && "text-destructive")}>{valor}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detalhe}</CardContent>
    </Card>
  );
}

/** Os quatro números do período: receita, custo, margem e obras. */
export function KpiCards({ k }: { k: Kpis }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi titulo="Receita realizada" valor={formatBRL(k.receitaRealizada)} detalhe={`A receber: ${formatBRL(k.receitaAReceber)}`} />
      <Kpi titulo="Custo realizado" valor={formatBRL(k.custoRealizado)} detalhe={`A pagar: ${formatBRL(k.custoAPagar)}`} />
      <Kpi
        titulo="Margem realizada"
        valor={formatBRL(k.margemRealizada)}
        negativo={k.margemRealizada < 0}
        detalhe={`${k.margemRealizadaBps === null ? "Sem receita no período" : `${formatBps(k.margemRealizadaBps)} da receita`} · projetada: ${formatBRL(k.margemProjetada)}${
          k.margemProjetadaBps === null ? "" : ` (${formatBps(k.margemProjetadaBps)})`
        }`}
      />
      <Kpi titulo="Obras" valor={String(k.obrasTotal)} detalhe={`${k.obrasAtivas} ativa(s)`} />
    </div>
  );
}
