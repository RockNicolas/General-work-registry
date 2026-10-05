"use client";

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatBRLCompact } from "@/lib/money";
import type { PontoEvolucao } from "../queries";
import { rotuloMes } from "../periodo";
import { tooltipBRL } from "./formatadores";

const config = {
  receita: { label: "Receita realizada", color: "var(--chart-2)" },
  custo: { label: "Custo realizado", color: "var(--chart-4)" },
  margem: { label: "Margem", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Receita × custo (realizados) por mês, com a margem do mês em linha. Só operacional. */
export function EvolucaoChart({ dados }: { dados: PontoEvolucao[] }) {
  const pontos = dados.map((d) => ({ ...d, rotulo: rotuloMes(d.mes) }));
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full" role="img" aria-label="Receita, custo e margem realizados, mês a mês">
      <ComposedChart data={pontos} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} width={78} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent formatter={tooltipBRL(config)} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="receita" fill="var(--color-receita)" radius={4} />
        <Bar dataKey="custo" fill="var(--color-custo)" radius={4} />
        <Line dataKey="margem" type="monotone" stroke="var(--color-margem)" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ChartContainer>
  );
}
