"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { Field } from "@/components/form/field";
import { FormDialog } from "@/components/form/form-dialog";
import { MoneyField } from "@/components/form/money-field";
import { SelectField } from "@/components/form/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ORIGEM_LABEL } from "@/lib/domain";
import { formatBRL } from "@/lib/money";
import { atualizarOrcamentoAction, criarOrcamentoAction, excluirOrcamentoAction } from "../actions";
import { type OrcamentoInput, orcamentoSchema } from "../schema";
import type { OrcamentoRow } from "../service";

const NENHUMA = "__nenhuma__";
type Opcao = { id: string; label: string };

function OrcamentoFormDialog({
  obraId,
  item,
  etapas,
  categorias,
}: {
  obraId: string;
  item?: OrcamentoRow;
  etapas: Opcao[];
  categorias: Opcao[];
}) {
  const editando = !!item;
  const padrao: OrcamentoInput = {
    obraId,
    etapaId: item?.etapaId ?? "",
    categoriaId: item?.categoriaId ?? "",
    descricao: item?.descricao ?? "",
    valorPrevistoCentavos: item?.valorPrevistoCentavos ?? (null as unknown as number),
    versao: item?.versao ?? 1,
    vigente: item?.vigente ?? true,
  };
  const form = useForm<OrcamentoInput>({ resolver: zodResolver(orcamentoSchema), defaultValues: padrao });
  const erros = form.formState.errors;

  const seletor = (id: string, nome: "etapaId" | "categoriaId", opcoes: Opcao[], rotulo: string) => (
    <Field label={rotulo} htmlFor={id} error={erros[nome]?.message}>
      <Controller
        control={form.control}
        name={nome}
        render={({ field }) => (
          <SelectField
            id={id}
            value={field.value === "" ? NENHUMA : field.value}
            onChange={(v) => field.onChange(v === NENHUMA ? "" : v)}
            options={[{ value: NENHUMA, label: "— Nenhuma —" }, ...opcoes.map((o) => ({ value: o.id, label: o.label }))]}
          />
        )}
      />
    </Field>
  );

  return (
    <FormDialog
      form={form}
      title={editando ? "Editar item de orçamento" : "Novo item de orçamento"}
      description="Valor previsto da obra, opcionalmente por etapa e categoria."
      successMessage={editando ? "Item atualizado." : "Item criado."}
      action={(values) => (editando ? atualizarOrcamentoAction(item.id, values) : criarOrcamentoAction(values))}
      onSuccess={() => !editando && form.reset(padrao)}
      trigger={
        editando ? (
          <Button variant="ghost" size="icon-sm" aria-label="Editar item de orçamento">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Novo item
          </Button>
        )
      }
    >
      {seletor("orc-etapa", "etapaId", etapas, "Etapa")}
      {seletor("orc-categoria", "categoriaId", categorias, "Categoria")}
      <Field label="Descrição" htmlFor="orc-descricao" error={erros.descricao?.message}>
        <Input id="orc-descricao" autoComplete="off" {...form.register("descricao")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Valor previsto (R$)" htmlFor="orc-valor" error={erros.valorPrevistoCentavos?.message}>
          <Controller
            control={form.control}
            name="valorPrevistoCentavos"
            render={({ field }) => (
              <MoneyField id="orc-valor" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!erros.valorPrevistoCentavos} />
            )}
          />
        </Field>
        <Field label="Versão" htmlFor="orc-versao" error={erros.versao?.message}>
          <Input id="orc-versao" type="number" min={1} {...form.register("versao", { valueAsNumber: true })} />
        </Field>
      </div>
      <Controller
        control={form.control}
        name="vigente"
        render={({ field }) => (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="grid gap-0.5">
              <span className="text-sm font-medium">Orçamento vigente</span>
              <span className="text-xs text-muted-foreground">Só os itens vigentes entram no previsto × realizado.</span>
            </div>
            <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Orçamento vigente" />
          </div>
        )}
      />
    </FormDialog>
  );
}

export function OrcamentoView({
  obraId,
  itens,
  etapas,
  categorias,
  isAdmin,
}: {
  obraId: string;
  itens: OrcamentoRow[];
  etapas: Opcao[];
  categorias: Opcao[];
  isAdmin: boolean;
}) {
  const totalVigente = itens.filter((i) => i.vigente).reduce((s, i) => s + i.valorPrevistoCentavos, 0);

  const columns: ColumnDef<OrcamentoRow>[] = [
    { accessorKey: "etapaLabel", header: "Etapa", cell: ({ row }) => row.original.etapaLabel ?? "—" },
    { accessorKey: "categoriaNome", header: "Categoria", cell: ({ row }) => row.original.categoriaNome ?? "—" },
    { accessorKey: "descricao", header: "Descrição", cell: ({ row }) => row.original.descricao ?? "—" },
    {
      accessorKey: "valorPrevistoCentavos",
      header: "Previsto",
      cell: ({ row }) => <span className="tabular-nums">{formatBRL(row.original.valorPrevistoCentavos)}</span>,
    },
    { accessorKey: "versao", header: "Versão", cell: ({ row }) => `v${row.original.versao}` },
    {
      accessorKey: "vigente",
      header: "Situação",
      cell: ({ row }) => (row.original.vigente ? <Badge variant="secondary">Vigente</Badge> : <Badge variant="outline">Anterior</Badge>),
    },
    { accessorKey: "origem", header: "Origem", cell: ({ row }) => ORIGEM_LABEL[row.original.origem] },
    ...(isAdmin
      ? [
          {
            id: "acoes",
            header: () => <span className="sr-only">Ações</span>,
            enableSorting: false,
            cell: ({ row }) =>
              row.original.origem === "manual" ? (
                <div className="flex justify-end gap-1">
                  <OrcamentoFormDialog obraId={obraId} item={row.original} etapas={etapas} categorias={categorias} />
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="Excluir item de orçamento">
                        <Trash2 />
                      </Button>
                    }
                    title="Excluir item de orçamento?"
                    description={`O item de ${formatBRL(row.original.valorPrevistoCentavos)} será removido.`}
                    successMessage="Item excluído."
                    action={() => excluirOrcamentoAction(obraId, row.original.id)}
                  />
                </div>
              ) : null,
          } as ColumnDef<OrcamentoRow>,
        ]
      : []),
  ];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Total vigente: <strong className="text-foreground tabular-nums">{formatBRL(totalVigente)}</strong>
        </p>
        {isAdmin && <OrcamentoFormDialog obraId={obraId} etapas={etapas} categorias={categorias} />}
      </div>
      <DataTable columns={columns} data={itens} emptyMessage="Nenhum item de orçamento nesta obra." pageSize={25} />
    </div>
  );
}
