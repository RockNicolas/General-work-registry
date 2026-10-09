"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatBRLCompact } from "@/lib/money";
import { formatBps } from "@/lib/percent";
import type { LinhaGrupo } from "../queries";
import { rotuloGrupo } from "../rotulos";
import { tooltipBRL } from "./formatadores";

const config = {
  orcado: { label: "Orçado", color: "var(--chart-3)" },
  comprometido: { label: "Comprometido", color: "var(--chart-1)" },
  incorrido: { label: "Incorrido (pago)", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Orçado × comprometido × incorrido por grupo de custo (materiais, M&E, MOD/MOI...), com o % comprometido. */
export function GruposChart({ grupos }: { grupos: LinhaGrupo[] }) {
  if (grupos.length === 0) return <p className="text-sm text-muted-foreground">Sem orçamento nem custos nos filtros escolhidos.</p>;
  const dados = grupos.map((g) => ({ ...g, rotulo: rotuloGrupo(g.grupo) }));
  return (
    <div className="grid gap-4">
      <ChartContainer config={config} className="aspect-auto h-72 w-full" role="img" aria-label="Orçado, comprometido e incorrido por grupo de custo">
        <BarChart data={dados} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
          <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} width={78} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent formatter={tooltipBRL(config)} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="orcado" fill="var(--color-orcado)" radius={4} />
          <Bar dataKey="comprometido" fill="var(--color-comprometido)" radius={4} />
          <Bar dataKey="incorrido" fill="var(--color-incorrido)" radius={4} />
        </BarChart>
      </ChartContainer>
      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {dados.map((g) => (
          <div key={g.grupo} className="flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2">
            <dt className="text-muted-foreground">{g.rotulo}</dt>
            <dd className="text-right">
              <span className="font-medium tabular-nums">{g.pctComprometidoBps === null ? "—" : formatBps(g.pctComprometidoBps)}</span>
              <span className="block text-xs text-muted-foreground">
                comprometido{g.pctDoOrcadoBps === null ? "" : ` · ${formatBps(g.pctDoOrcadoBps)} do orçamento`}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
