"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { Field } from "@/components/form/field";
import { FormDialog } from "@/components/form/form-dialog";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { atualizarEtapaAction, criarEtapaAction, excluirEtapaAction } from "../actions";
import { type EtapaInput, etapaSchema } from "../schema";
import type { EtapaRow } from "../service";

const SEM_PAI = "__nenhuma__";

function EtapaFormDialog({ obraId, etapa, etapas }: { obraId: string; etapa?: EtapaRow; etapas: EtapaRow[] }) {
  const editando = !!etapa;
  const form = useForm<EtapaInput>({
    resolver: zodResolver(etapaSchema),
    defaultValues: { obraId, codigo: etapa?.codigo ?? "", nome: etapa?.nome ?? "", paiId: etapa?.paiId ?? "" },
  });
  const erros = form.formState.errors;
  const candidatas = etapas.filter((e) => e.id !== etapa?.id);

  return (
    <FormDialog
      form={form}
      title={editando ? "Editar etapa" : "Nova etapa"}
      description="Etapas organizam o orçamento e os lançamentos da obra (centros de custo)."
      successMessage={editando ? "Etapa atualizada." : "Etapa criada."}
      action={(values) => (editando ? atualizarEtapaAction(etapa.id, values) : criarEtapaAction(values))}
      onSuccess={() => !editando && form.reset({ obraId, codigo: "", nome: "", paiId: "" })}
      trigger={
        editando ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar etapa ${etapa.codigo}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Nova etapa
          </Button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field label="Código" htmlFor="etapa-codigo" error={erros.codigo?.message}>
          <Input id="etapa-codigo" autoComplete="off" placeholder="01.02" {...form.register("codigo")} />
        </Field>
        <Field label="Nome" htmlFor="etapa-nome" error={erros.nome?.message}>
          <Input id="etapa-nome" autoComplete="off" {...form.register("nome")} />
        </Field>
      </div>
      <Field label="Etapa-pai" htmlFor="etapa-pai" error={erros.paiId?.message} hint="Opcional. Deixe em branco para uma etapa de primeiro nível.">
        <Controller
          control={form.control}
          name="paiId"
          render={({ field }) => (
            <SelectField
              id="etapa-pai"
              value={field.value === "" ? SEM_PAI : field.value}
              onChange={(v) => field.onChange(v === SEM_PAI ? "" : v)}
              options={[
                { value: SEM_PAI, label: "— Nenhuma (primeiro nível) —" },
                ...candidatas.map((e) => ({ value: e.id, label: `${e.codigo} — ${e.nome}` })),
              ]}
            />
          )}
        />
      </Field>
    </FormDialog>
  );
}

export function EtapasView({ obraId, etapas, isAdmin }: { obraId: string; etapas: EtapaRow[]; isAdmin: boolean }) {
  const columns: ColumnDef<EtapaRow>[] = [
    {
      accessorKey: "codigo",
      header: "Código",
      cell: ({ row }) => (
        <span className="font-mono text-xs" style={{ paddingLeft: `${row.original.nivel * 1.25}rem` }}>
          {row.original.codigo}
        </span>
      ),
    },
    { accessorKey: "nome", header: "Etapa", cell: ({ row }) => <span className="font-medium">{row.original.nome}</span> },
    ...(isAdmin
      ? [
          {
            id: "acoes",
            header: () => <span className="sr-only">Ações</span>,
            enableSorting: false,
            cell: ({ row }) => (
              <div className="flex justify-end gap-1">
                <EtapaFormDialog obraId={obraId} etapa={row.original} etapas={etapas} />
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Excluir etapa ${row.original.codigo}`}>
                      <Trash2 />
                    </Button>
                  }
                  title="Excluir etapa?"
                  description={`"${row.original.codigo} — ${row.original.nome}" será excluída. Etapas com filhas, orçamento ou lançamentos não podem ser excluídas.`}
                  successMessage="Etapa excluída."
                  action={() => excluirEtapaAction(obraId, row.original.id)}
                />
              </div>
            ),
          } as ColumnDef<EtapaRow>,
        ]
      : []),
  ];

  return (
    <div className="grid gap-3">
      {isAdmin && (
        <div className="flex justify-end">
          <EtapaFormDialog obraId={obraId} etapas={etapas} />
        </div>
      )}
      <DataTable columns={columns} data={etapas} searchPlaceholder="Buscar etapa..." emptyMessage="Nenhuma etapa cadastrada nesta obra." pageSize={50} />
    </div>
  );
}
