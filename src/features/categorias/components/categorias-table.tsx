"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { SelectField } from "@/components/form/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORIA_GRUPO_LABEL } from "@/lib/domain";
import { excluirCategoriaAction } from "../actions";
import type { CategoriaRow } from "../service";
import { CategoriaFormDialog } from "./categoria-form-dialog";

const TODAS = "todas";

export function CategoriasTable({ data, empresas }: { data: CategoriaRow[]; empresas: { id: string; nome: string }[] }) {
  const [empresaId, setEmpresaId] = useState(TODAS);
  const filtradas = useMemo(() => data.filter((c) => empresaId === TODAS || c.empresaId === empresaId), [data, empresaId]);

  const columns: ColumnDef<CategoriaRow>[] = [
    { accessorKey: "nome", header: "Categoria", cell: ({ row }) => <span className="font-medium">{row.original.nome}</span> },
    { accessorKey: "empresaNome", header: "Empresa" },
    {
      accessorKey: "grupo",
      header: "Grupo",
      cell: ({ row }) => <Badge variant="secondary">{CATEGORIA_GRUPO_LABEL[row.original.grupo]}</Badge>,
    },
    { accessorKey: "codigoOrigem", header: "Código no ERP", cell: ({ row }) => row.original.codigoOrigem ?? "—" },
    {
      id: "acoes",
      header: () => <span className="sr-only">Ações</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <CategoriaFormDialog categoria={row.original} empresas={empresas} />
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${row.original.nome}`}>
                <Trash2 />
              </Button>
            }
            title="Excluir categoria?"
            description={`"${row.original.nome}" será excluída. Categorias usadas em lançamentos ou orçamentos não podem ser excluídas.`}
            successMessage="Categoria excluída."
            action={() => excluirCategoriaAction(row.original.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={filtradas}
      searchPlaceholder="Buscar categoria..."
      emptyMessage="Nenhuma categoria cadastrada."
      toolbar={
        empresas.length > 1 ? (
          <div className="w-52">
            <SelectField
              id="filtro-cat-empresa"
              value={empresaId}
              onChange={setEmpresaId}
              options={[{ value: TODAS, label: "Todas as empresas" }, ...empresas.map((e) => ({ value: e.id, label: e.nome }))]}
            />
          </div>
        ) : undefined
      }
    />
  );
}
