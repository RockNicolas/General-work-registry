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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCompetenciaBR } from "@/lib/dates";
import { AVANCO_TIPOS, AVANCO_TIPO_LABEL } from "@/lib/domain";
import { formatBps, formatBpsInput } from "@/lib/percent";
import { atualizarAvancoAction, criarAvancoAction, excluirAvancoAction } from "../actions";
import type { ComparativoMes } from "../comparativo";
import { type AvancoInput, avancoSchema } from "../schema";
import type { AvancoRow } from "../service";

function AvancoFormDialog({ obraId, linha }: { obraId: string; linha?: AvancoRow }) {
  const editando = !!linha;
  const padrao: AvancoInput = {
    obraId,
    competencia: linha ? linha.competencia.slice(0, 7) : "",
    tipo: linha?.tipo ?? "realizado",
    versao: linha?.versao ?? 0,
    pctMes: linha ? formatBpsInput(linha.pctMesBps) : "",
    pctAcum: linha ? formatBpsInput(linha.pctAcumBps) : "",
  };
  const form = useForm<AvancoInput>({ resolver: zodResolver(avancoSchema), defaultValues: padrao });
  const erros = form.formState.errors;

  return (
    <FormDialog
      form={form}
      title={editando ? "Editar avanço físico" : "Novo avanço físico"}
      description="Percentuais da obra no mês (0 a 100). Versão 0 é a linha de base do planejamento."
      successMessage={editando ? "Avanço atualizado." : "Avanço lançado."}
      action={(values) => (editando ? atualizarAvancoAction(linha.id, values) : criarAvancoAction(values))}
      onSuccess={() => !editando && form.reset(padrao)}
      trigger={
        editando ? (
          <Button variant="ghost" size="icon-sm" aria-label="Editar avanço">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Novo avanço
          </Button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Competência" htmlFor="avanco-competencia" error={erros.competencia?.message}>
          <Input id="avanco-competencia" type="month" {...form.register("competencia")} />
        </Field>
        <Field label="Tipo" htmlFor="avanco-tipo" error={erros.tipo?.message}>
          <Controller
            control={form.control}
            name="tipo"
            render={({ field }) => (
              <SelectField
                id="avanco-tipo"
                value={field.value}
                onChange={field.onChange}
                options={AVANCO_TIPOS.map((t) => ({ value: t, label: AVANCO_TIPO_LABEL[t] }))}
              />
            )}
          />
        </Field>
        <Field label="Versão" htmlFor="avanco-versao" error={erros.versao?.message}>
          <Input id="avanco-versao" type="number" min={0} {...form.register("versao", { valueAsNumber: true })} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="% no mês" htmlFor="avanco-mes" error={erros.pctMes?.message}>
          <Input id="avanco-mes" inputMode="decimal" placeholder="12,5" autoComplete="off" {...form.register("pctMes")} />
        </Field>
        <Field label="% acumulado" htmlFor="avanco-acum" error={erros.pctAcum?.message}>
          <Input id="avanco-acum" inputMode="decimal" placeholder="45" autoComplete="off" {...form.register("pctAcum")} />
        </Field>
      </div>
    </FormDialog>
  );
}

const pct = (v: number | null) => (v === null ? "—" : formatBps(v));

export function AvancoView({
  obraId,
  linhas,
  comparativo,
  isAdmin,
}: {
  obraId: string;
  linhas: AvancoRow[];
  comparativo: ComparativoMes[];
  isAdmin: boolean;
}) {
  const columns: ColumnDef<AvancoRow>[] = [
    {
      accessorKey: "competencia",
      header: "Competência",
      cell: ({ row }) => formatCompetenciaBR(row.original.competencia),
    },
    {
      accessorKey: "tipo",
      header: "Tipo",
      cell: ({ row }) => <Badge variant="secondary">{AVANCO_TIPO_LABEL[row.original.tipo]}</Badge>,
    },
    { accessorKey: "versao", header: "Versão", cell: ({ row }) => `v${row.original.versao}` },
    { accessorKey: "pctMesBps", header: "% no mês", cell: ({ row }) => formatBps(row.original.pctMesBps) },
    { accessorKey: "pctAcumBps", header: "% acumulado", cell: ({ row }) => formatBps(row.original.pctAcumBps) },
    ...(isAdmin
      ? [
          {
            id: "acoes",
            header: () => <span className="sr-only">Ações</span>,
            enableSorting: false,
            cell: ({ row }) => (
              <div className="flex justify-end gap-1">
                <AvancoFormDialog obraId={obraId} linha={row.original} />
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label="Excluir avanço">
                      <Trash2 />
                    </Button>
                  }
                  title="Excluir registro de avanço?"
                  description={`${AVANCO_TIPO_LABEL[row.original.tipo]} de ${formatCompetenciaBR(row.original.competencia)} (v${row.original.versao}).`}
                  successMessage="Registro excluído."
                  action={() => excluirAvancoAction(obraId, row.original.id)}
                />
              </div>
            ),
          } as ColumnDef<AvancoRow>,
        ]
      : []),
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Planejado × realizado (acumulado)</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead>Planejado (mês)</TableHead>
                <TableHead>Planejado (acum.)</TableHead>
                <TableHead>Realizado (mês)</TableHead>
                <TableHead>Realizado (acum.)</TableHead>
                <TableHead>Desvio acum.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparativo.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                    Nenhum avanço lançado.
                  </TableCell>
                </TableRow>
              ) : (
                comparativo.map((m) => (
                  <TableRow key={m.competencia}>
                    <TableCell>{formatCompetenciaBR(m.competencia)}</TableCell>
                    <TableCell className="tabular-nums">{pct(m.planejadoMesBps)}</TableCell>
                    <TableCell className="tabular-nums">{pct(m.planejadoAcumBps)}</TableCell>
                    <TableCell className="tabular-nums">{pct(m.realizadoMesBps)}</TableCell>
                    <TableCell className="tabular-nums">{pct(m.realizadoAcumBps)}</TableCell>
                    <TableCell
                      className={`tabular-nums ${m.desvioAcumBps !== null && m.desvioAcumBps < 0 ? "text-destructive" : ""}`}
                    >
                      {m.desvioAcumBps === null ? "—" : `${m.desvioAcumBps > 0 ? "+" : ""}${formatBps(m.desvioAcumBps)}`}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Registros</h2>
          {isAdmin && <AvancoFormDialog obraId={obraId} />}
        </div>
        <DataTable columns={columns} data={linhas} emptyMessage="Nenhum registro de avanço." pageSize={12} />
      </section>
    </div>
  );
}
