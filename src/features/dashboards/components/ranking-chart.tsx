"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatBRLCompact } from "@/lib/money";
import type { FatiaRotulada } from "../calculos";
import { tooltipBRL } from "./formatadores";

const config = { valor: { label: "Custo comprometido", color: "var(--chart-1)" } } satisfies ChartConfig;

const CORES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)"];

/** Ranking horizontal (categorias ou etapas) do custo comprometido no período. */
export function RankingChart({ fatias, descricao }: { fatias: FatiaRotulada[]; descricao: string }) {
  if (fatias.length === 0) return <p className="text-sm text-muted-foreground">Sem custos no período.</p>;
  const altura = Math.max(160, fatias.length * 34 + 24);
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: altura }} role="img" aria-label={descricao}>
      <BarChart data={fatias} layout="vertical" margin={{ left: 4, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <YAxis dataKey="rotulo" type="category" width={132} tickLine={false} axisLine={false} interval={0} tickFormatter={(t: string) => (t.length > 20 ? `${t.slice(0, 19)}…` : t)} />
        <XAxis type="number" tickFormatter={(v) => formatBRLCompact(Number(v))} tickLine={false} axisLine={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} formatter={tooltipBRL(config)} />} />
        <Bar dataKey="valor" radius={4}>
          {fatias.map((f, i) => (
            <Cell key={f.rotulo} fill={f.rotulo === "Demais" ? "var(--muted-foreground)" : CORES[i % CORES.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
