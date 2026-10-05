import type { ReactNode } from "react";
import type { ChartConfig } from "@/components/ui/chart";
import { formatBRL } from "@/lib/money";

/** Valor em centavos que veio de um número do gráfico (o Recharts pode interpolar fracionados). */
export const reais = (v: unknown): string => formatBRL(Math.round(Number(v) || 0));

/**
 * Linha do tooltip dos gráficos monetários: cor, nome (do config do gráfico) e valor em R$.
 * O formatador padrão do shadcn usa `toLocaleString()` sem moeda.
 */
export function tooltipBRL(config: ChartConfig) {
  return function TooltipLinha(valor: unknown, nome: unknown, item: { color?: string; dataKey?: unknown }): ReactNode {
    const chave = String(item.dataKey ?? nome);
    return (
      <div className="flex w-full items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
          {config[chave]?.label ?? String(nome)}
        </span>
        <span className="font-mono font-medium text-foreground tabular-nums">{reais(valor)}</span>
      </div>
    );
  };
}
