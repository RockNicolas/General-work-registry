"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatBRL, formatBRLCompact } from "@/lib/money";
import type { Vencimentos } from "../faixas";
import { tooltipBRL } from "./formatadores";

const config = {
  efetivo: { label: "Títulos efetivos", color: "var(--chart-1)" },
  previsao: { label: "Títulos de previsão", color: "var(--chart-3)" },
} satisfies ChartConfig;

/** Contas a pagar/receber por faixa de vencimento (dias a partir de hoje: 30/45/60/90/120), com e sem título de previsão. */
export function VencimentosChart({ dados, titulo }: { dados: Vencimentos; titulo: string }) {
  const total = dados.faixas.reduce((s, f) => s + f.efetivo + f.previsao, 0);
  if (total === 0 && dados.semVencimento === 0) return <p className="text-sm text-muted-foreground">Nada a vencer nos filtros escolhidos.</p>;
  return (
    <div className="grid gap-2">
      <ChartContainer config={config} className="aspect-auto h-64 w-full" role="img" aria-label={titulo}>
        <BarChart data={dados.faixas} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="curto" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
          <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} width={78} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent formatter={tooltipBRL(config)} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="efetivo" stackId="v" fill="var(--color-efetivo)" />
          <Bar dataKey="previsao" stackId="v" fill="var(--color-previsao)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        Total a vencer: <strong className="text-foreground tabular-nums">{formatBRL(total)}</strong>
        {dados.semVencimento !== 0 && <> · sem data de vencimento: <strong className="text-foreground tabular-nums">{formatBRL(dados.semVencimento)}</strong> (fora das faixas)</>}
      </p>
    </div>
  );
}
