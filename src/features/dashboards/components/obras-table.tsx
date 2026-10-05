"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatBRL } from "@/lib/money";
import { formatBps } from "@/lib/percent";
import { cn } from "@/lib/utils";
import type { LinhaObra } from "../queries";

const SEM = Number.NEGATIVE_INFINITY; // sem percentual: vai para o fim ao ordenar do maior para o menor

const Valor = ({ centavos, className }: { centavos: number; className?: string }) => <span className={cn("whitespace-nowrap tabular-nums", className)}>{formatBRL(centavos)}</span>;
const Pct = ({ bps }: { bps: number | null }) => <span className="whitespace-nowrap tabular-nums">{bps === null ? "—" : formatBps(bps)}</span>;

/** Ranking e comparativo de obras: orçado × comprometido × incorrido, desvio e margens. */
export function ObrasComparativoTable({ obras }: { obras: LinhaObra[] }) {
  const varias = new Set(obras.map((o) => o.empresaId)).size > 1;

  const columns: ColumnDef<LinhaObra>[] = [
    {
      id: "obra",
      header: "Obra",
      accessorFn: (o) => `${o.codigo} ${o.nome}`,
      cell: ({ row }) => (
        <Link href={`/obras/${row.original.id}`} className="font-medium underline-offset-4 hover:underline">
          {row.original.codigo} — {row.original.nome}
        </Link>
      ),
    },
    ...(varias ? [{ id: "empresa", header: "Empresa", accessorFn: (o: LinhaObra) => o.empresaNome } as ColumnDef<LinhaObra>] : []),
    { id: "orcado", header: "Orçado", accessorFn: (o) => o.orcado, cell: ({ row }) => <Valor centavos={row.original.orcado} /> },
    { id: "comprometido", header: "Comprometido", accessorFn: (o) => o.comprometido, cell: ({ row }) => <Valor centavos={row.original.comprometido} /> },
    { id: "pct", header: "% orçado", accessorFn: (o) => o.pctComprometidoBps ?? SEM, cell: ({ row }) => <Pct bps={row.original.pctComprometidoBps} /> },
    { id: "incorrido", header: "Incorrido", accessorFn: (o) => o.incorrido, cell: ({ row }) => <Valor centavos={row.original.incorrido} /> },
    {
      id: "desvio",
      header: "Desvio",
      accessorFn: (o) => o.desvio,
      cell: ({ row }) => {
        const { desvio, desvioBps, orcado } = row.original;
        if (orcado === 0) return <span className="text-muted-foreground">sem orçamento</span>;
        return (
          <span className={cn("whitespace-nowrap tabular-nums", desvio > 0 && "font-medium text-destructive")}>
            {desvio > 0 ? "+" : ""}
            {formatBRL(desvio)} {desvioBps !== null && `(${desvio > 0 ? "+" : ""}${formatBps(desvioBps)})`}
          </span>
        );
      },
    },
    { id: "receita", header: "Receita", accessorFn: (o) => o.receitaRealizada, cell: ({ row }) => <Valor centavos={row.original.receitaRealizada} /> },
    {
      id: "margem",
      header: "Margem",
      accessorFn: (o) => o.margemRealizadaBps ?? SEM,
      cell: ({ row }) => (
        <span className={cn("whitespace-nowrap tabular-nums", row.original.margemRealizada < 0 && "font-medium text-destructive")}>
          {formatBRL(row.original.margemRealizada)} {row.original.margemRealizadaBps !== null && `(${formatBps(row.original.margemRealizadaBps)})`}
        </span>
      ),
    },
    { id: "projetada", header: "Margem proj.", accessorFn: (o) => o.margemProjetadaBps ?? SEM, cell: ({ row }) => <Pct bps={row.original.margemProjetadaBps} /> },
  ];

  return <DataTable columns={columns} data={obras} searchPlaceholder="Buscar obra..." emptyMessage="Nenhuma obra nos filtros escolhidos." pageSize={15} />;
}
