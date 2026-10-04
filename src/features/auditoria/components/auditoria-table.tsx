"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateTimeBR } from "@/lib/dates";
import type { AuditoriaRow } from "../service";

const json = (v: unknown) => (v === null || v === undefined ? "—" : JSON.stringify(v, null, 2));

function Detalhes({ evento }: { evento: AuditoriaRow }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Ver detalhes do evento">
          <Eye />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{evento.resumo ?? `${evento.acao} ${evento.entidade}`}</DialogTitle>
          <DialogDescription>
            {evento.usuarioNome ?? "Sistema"} · {formatDateTimeBR(new Date(evento.criadoEm))}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["Antes", evento.antes],
              ["Depois", evento.depois],
            ] as const
          ).map(([titulo, valor]) => (
            <div key={titulo} className="grid gap-1">
              <span className="text-sm font-medium">{titulo}</span>
              <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">{json(valor)}</pre>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const columns: ColumnDef<AuditoriaRow>[] = [
  {
    accessorKey: "criadoEm",
    header: "Quando",
    cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTimeBR(new Date(row.original.criadoEm))}</span>,
  },
  { accessorKey: "usuarioNome", header: "Quem", cell: ({ row }) => row.original.usuarioNome ?? "Sistema" },
  { accessorKey: "acao", header: "Ação", cell: ({ row }) => <Badge variant="secondary">{row.original.acao}</Badge> },
  { accessorKey: "entidade", header: "Entidade" },
  { accessorKey: "resumo", header: "Resumo", cell: ({ row }) => row.original.resumo ?? "—" },
  {
    id: "detalhes",
    header: () => <span className="sr-only">Detalhes</span>,
    enableSorting: false,
    cell: ({ row }) => <Detalhes evento={row.original} />,
  },
];

export function AuditoriaTable({ data }: { data: AuditoriaRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Buscar por usuário, entidade ou resumo..."
      emptyMessage="Nenhum evento registrado."
      pageSize={20}
    />
  );
}
