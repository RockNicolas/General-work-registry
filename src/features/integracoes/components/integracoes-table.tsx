"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { formatDateTimeBR } from "@/lib/dates";
import { ERP_LABEL } from "@/lib/domain";
import type { IntegracaoRow } from "../service";
import { IntegracaoStatusBadge, SyncStatusBadge } from "./status-badge";

const columns: ColumnDef<IntegracaoRow>[] = [
  {
    accessorKey: "nome",
    header: "Integração",
    cell: ({ row }) => (
      <Link href={`/admin/integracoes/${row.original.id}`} className="font-medium underline-offset-4 hover:underline">
        {row.original.nome}
      </Link>
    ),
  },
  { accessorKey: "empresaNome", header: "Empresa" },
  { id: "erp", header: "Sistema", accessorFn: (i) => ERP_LABEL[i.erp] },
  { accessorKey: "status", header: "Situação", cell: ({ row }) => <IntegracaoStatusBadge status={row.original.status} /> },
  {
    id: "ultima",
    header: "Última sincronização",
    accessorFn: (i) => i.ultimaSyncEm ?? "",
    cell: ({ row }) => {
      const { ultimaSyncEm, ultimaExecucao } = row.original;
      if (!ultimaSyncEm && !ultimaExecucao) return <span className="text-muted-foreground">Nunca</span>;
      return (
        <div className="flex flex-wrap items-center gap-2">
          {ultimaExecucao && <SyncStatusBadge status={ultimaExecucao.status} />}
          <span className="whitespace-nowrap text-muted-foreground">{formatDateTimeBR(new Date(ultimaSyncEm ?? ultimaExecucao!.em))}</span>
        </div>
      );
    },
  },
  { id: "obras", header: "Obras vinculadas", accessorFn: (i) => i.totalVinculos, cell: ({ row }) => <span className="tabular-nums">{row.original.totalVinculos}</span> },
  {
    id: "abrir",
    header: () => <span className="sr-only">Abrir</span>,
    enableSorting: false,
    cell: ({ row }) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={`/admin/integracoes/${row.original.id}`}>Abrir</Link>
      </Button>
    ),
  },
];

export function IntegracoesTable({ data }: { data: IntegracaoRow[] }) {
  return <DataTable columns={columns} data={data} searchPlaceholder="Buscar integração ou empresa..." emptyMessage="Nenhuma integração cadastrada." />;
}
