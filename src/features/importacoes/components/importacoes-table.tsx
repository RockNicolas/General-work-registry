"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { formatDateTimeBR } from "@/lib/dates";
import type { ImportacaoRow } from "../service";
import { ImportacaoStatusBadge } from "./status-badge";

const columns: ColumnDef<ImportacaoRow>[] = [
  {
    accessorKey: "criadoEm",
    header: "Enviada em",
    cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTimeBR(new Date(row.original.criadoEm))}</span>,
  },
  { accessorKey: "arquivoNome", header: "Arquivo", cell: ({ row }) => <span className="font-medium">{row.original.arquivoNome}</span> },
  { accessorKey: "empresaNome", header: "Empresa" },
  { accessorKey: "usuarioNome", header: "Enviada por", cell: ({ row }) => row.original.usuarioNome ?? "—" },
  { accessorKey: "status", header: "Situação", cell: ({ row }) => <ImportacaoStatusBadge status={row.original.status} /> },
  {
    id: "linhas",
    header: "Linhas (válidas / erros)",
    accessorFn: (r) => r.total,
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.total} ({row.original.ok} / {row.original.comErro})
      </span>
    ),
  },
  {
    id: "abrir",
    header: () => <span className="sr-only">Abrir</span>,
    enableSorting: false,
    cell: ({ row }) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={`/importacoes/${row.original.id}`}>Abrir</Link>
      </Button>
    ),
  },
];

export function ImportacoesTable({ data }: { data: ImportacaoRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Buscar por arquivo ou empresa..."
      emptyMessage="Nenhuma planilha importada ainda."
    />
  );
}
