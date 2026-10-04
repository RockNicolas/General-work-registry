"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { formatDateBR } from "@/lib/dates";
import { OBRA_STATUS, OBRA_STATUS_LABEL } from "@/lib/domain";
import { excluirObraAction } from "../actions";
import type { ObraRow } from "../service";
import { ObraFormDialog } from "./obra-form-dialog";
import { ObraStatusBadge } from "./obra-status-badge";

const TODOS = "todos";

export function ObrasTable({
  data,
  empresas,
  isAdmin,
}: {
  data: ObraRow[];
  empresas: { id: string; nome: string }[];
  isAdmin: boolean;
}) {
  const [status, setStatus] = useState(TODOS);
  const [empresaId, setEmpresaId] = useState(TODOS);

  const filtradas = useMemo(
    () =>
      data.filter(
        (o) => (status === TODOS || o.status === status) && (empresaId === TODOS || o.empresaId === empresaId),
      ),
    [data, status, empresaId],
  );

  const columns: ColumnDef<ObraRow>[] = [
    { accessorKey: "codigo", header: "Código" },
    {
      accessorKey: "nome",
      header: "Obra",
      cell: ({ row }) => (
        <Link href={`/obras/${row.original.id}`} className="font-medium underline-offset-4 hover:underline">
          {row.original.nome}
        </Link>
      ),
    },
    ...(empresas.length > 1 ? [{ accessorKey: "empresaNome", header: "Empresa" } as ColumnDef<ObraRow>] : []),
    { accessorKey: "status", header: "Situação", cell: ({ row }) => <ObraStatusBadge status={row.original.status} /> },
    {
      id: "local",
      header: "Local",
      accessorFn: (o) => [o.cidade, o.uf].filter(Boolean).join("/"),
      cell: ({ getValue }) => (getValue<string>() ? getValue<string>() : "—"),
    },
    {
      accessorKey: "dataInicio",
      header: "Início",
      cell: ({ row }) => (row.original.dataInicio ? formatDateBR(row.original.dataInicio) : "—"),
    },
    {
      accessorKey: "dataFimPrevista",
      header: "Fim previsto",
      cell: ({ row }) => (row.original.dataFimPrevista ? formatDateBR(row.original.dataFimPrevista) : "—"),
    },
    ...(isAdmin
      ? [
          {
            id: "acoes",
            header: () => <span className="sr-only">Ações</span>,
            enableSorting: false,
            cell: ({ row }) => (
              <div className="flex justify-end gap-1">
                <ObraFormDialog obra={row.original} empresas={empresas} />
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${row.original.nome}`}>
                      <Trash2 />
                    </Button>
                  }
                  title="Excluir obra?"
                  description={`"${row.original.nome}" será excluída com etapas, orçamento e avanço. Obras com lançamentos não podem ser excluídas.`}
                  successMessage="Obra excluída."
                  action={() => excluirObraAction(row.original.id)}
                />
              </div>
            ),
          } as ColumnDef<ObraRow>,
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      data={filtradas}
      searchPlaceholder="Buscar obra..."
      emptyMessage="Nenhuma obra encontrada."
      toolbar={
        <>
          <div className="w-44">
            <SelectField
              id="filtro-status"
              value={status}
              onChange={setStatus}
              options={[
                { value: TODOS, label: "Todas as situações" },
                ...OBRA_STATUS.map((s) => ({ value: s, label: OBRA_STATUS_LABEL[s] })),
              ]}
            />
          </div>
          {empresas.length > 1 && (
            <div className="w-52">
              <SelectField
                id="filtro-empresa"
                value={empresaId}
                onChange={setEmpresaId}
                options={[{ value: TODOS, label: "Todas as empresas" }, ...empresas.map((e) => ({ value: e.id, label: e.nome }))]}
              />
            </div>
          )}
        </>
      }
    />
  );
}
