"use client";

import Link from "next/link";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatBps } from "@/lib/percent";
import { rotuloMes } from "../periodo";
import type { AvancoObra } from "../queries";

const config = {
  planejado: { label: "Planejado (acumulado)", color: "var(--chart-3)" },
  realizado: { label: "Realizado (acumulado)", color: "var(--chart-2)" },
} satisfies ChartConfig;

const pct = (v: unknown) => formatBps(Math.round(Number(v) || 0));

/** Curva de avanço físico acumulado, planejado × realizado, de UMA obra. */
export function AvancoCurva({ obra }: { obra: AvancoObra }) {
  const dados = obra.serie.map((m) => ({ rotulo: rotuloMes(m.competencia.slice(0, 7)), planejado: m.planejadoAcumBps, realizado: m.realizadoAcumBps }));
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full" role="img" aria-label={`Avanço físico acumulado, planejado e realizado, de ${obra.nome}`}>
      <LineChart data={dados} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis domain={[0, 10_000]} tickFormatter={(v) => `${Math.round(Number(v) / 100)}%`} width={48} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, nome, item) => (
          <div className="flex w-full items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
              {config[String(item.dataKey) as keyof typeof config]?.label ?? String(nome)}
            </span>
            <span className="font-mono font-medium text-foreground tabular-nums">{pct(v)}</span>
          </div>
        )} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line dataKey="planejado" type="monotone" stroke="var(--color-planejado)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        <Line dataKey="realizado" type="monotone" stroke="var(--color-realizado)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ChartContainer>
  );
}

/** Situação atual de cada obra: realizado × planejado do último mês informado e o desvio em pontos percentuais. */
export function AvancoTabela({ obras }: { obras: AvancoObra[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-2 font-normal">Obra</th>
            <th className="px-3 py-2 font-normal">Mês de referência</th>
            <th className="px-3 py-2 text-right font-normal">Planejado</th>
            <th className="px-3 py-2 text-right font-normal">Realizado</th>
            <th className="px-3 py-2 text-right font-normal">Desvio</th>
          </tr>
        </thead>
        <tbody>
          {obras.map((o) => (
            <tr key={o.obraId} className="border-b last:border-0">
              <td className="px-3 py-2">
                <Link href={`/obras/${o.obraId}/avanco`} className="font-medium underline-offset-4 hover:underline">
                  {o.codigo} — {o.nome}
                </Link>
              </td>
              {o.atual ? (
                <>
                  <td className="px-3 py-2">{rotuloMes(o.atual.competencia.slice(0, 7))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.atual.planejadoAcumBps === null ? "—" : formatBps(o.atual.planejadoAcumBps)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBps(o.atual.realizadoAcumBps!)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${o.atual.desvioAcumBps !== null && o.atual.desvioAcumBps < 0 ? "text-destructive" : ""}`}>
                    {o.atual.desvioAcumBps === null ? "—" : `${o.atual.desvioAcumBps > 0 ? "+" : ""}${formatBps(o.atual.desvioAcumBps)}`}
                  </td>
                </>
              ) : (
                <td colSpan={4} className="px-3 py-2 text-muted-foreground">
                  Só o planejamento foi informado; sem avanço realizado.
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
