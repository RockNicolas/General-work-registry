"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { formatarCnpj } from "@/lib/cnpj";
import type { EmpresaRow } from "../service";
import { EmpresaFormDialog } from "./empresa-form-dialog";

const columns: ColumnDef<EmpresaRow>[] = [
  { accessorKey: "nome", header: "Empresa", cell: ({ row }) => <span className="font-medium">{row.original.nome}</span> },
  { accessorKey: "razaoSocial", header: "Razão social", cell: ({ row }) => row.original.razaoSocial ?? "—" },
  {
    accessorKey: "cnpj",
    header: "CNPJ",
    cell: ({ row }) => (row.original.cnpj ? formatarCnpj(row.original.cnpj) : "—"),
  },
  { accessorKey: "totalObras", header: "Obras" },
  {
    accessorKey: "ativo",
    header: "Situação",
    cell: ({ row }) =>
      row.original.ativo ? <Badge variant="secondary">Ativa</Badge> : <Badge variant="outline">Inativa</Badge>,
  },
  {
    id: "acoes",
    header: () => <span className="sr-only">Ações</span>,
    enableSorting: false,
    cell: ({ row }) => <EmpresaFormDialog empresa={row.original} />,
  },
];

export function EmpresasTable({ data }: { data: EmpresaRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Buscar empresa..."
      emptyMessage="Nenhuma empresa cadastrada ainda."
    />
  );
}
