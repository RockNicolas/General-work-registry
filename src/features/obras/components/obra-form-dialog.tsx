"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Field } from "@/components/form/field";
import { FormDialog } from "@/components/form/form-dialog";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OBRA_STATUS, OBRA_STATUS_LABEL, UFS } from "@/lib/domain";
import { atualizarObraAction, criarObraAction } from "../actions";
import { type ObraInput, obraSchema } from "../schema";
import type { ObraRow } from "../service";

export function ObraFormDialog({
  obra,
  empresas,
  empresaPadraoId,
  triggerVariant = "icon",
}: {
  obra?: ObraRow;
  empresas: { id: string; nome: string }[];
  empresaPadraoId?: string;
  triggerVariant?: "icon" | "button";
}) {
  const editando = !!obra;
  const form = useForm<ObraInput>({
    resolver: zodResolver(obraSchema),
    defaultValues: {
      empresaId: obra?.empresaId ?? empresaPadraoId ?? (empresas.length === 1 ? empresas[0]!.id : ""),
      codigo: obra?.codigo ?? "",
      nome: obra?.nome ?? "",
      status: obra?.status ?? "planejada",
      dataInicio: obra?.dataInicio ?? "",
      dataFimPrevista: obra?.dataFimPrevista ?? "",
      cidade: obra?.cidade ?? "",
      uf: obra?.uf ?? "",
    },
  });
  const { register, control, formState } = form;
  const erros = formState.errors;

  return (
    <FormDialog
      form={form}
      title={editando ? "Editar obra" : "Nova obra"}
      successMessage={editando ? "Obra atualizada." : "Obra criada."}
      action={(values) => (editando ? atualizarObraAction(obra.id, values) : criarObraAction(values))}
      onSuccess={() => !editando && form.reset()}
      trigger={
        editando && triggerVariant === "icon" ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${obra.nome}`}>
            <Pencil />
          </Button>
        ) : editando ? (
          <Button variant="outline">
            <Pencil />
            Editar obra
          </Button>
        ) : (
          <Button>
            <Plus />
            Nova obra
          </Button>
        )
      }
    >
      <Field label="Empresa" htmlFor="obra-empresa" error={erros.empresaId?.message}>
        <Controller
          control={control}
          name="empresaId"
          render={({ field }) => (
            <SelectField
              id="obra-empresa"
              value={field.value}
              onChange={field.onChange}
              options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
              invalid={!!erros.empresaId}
              disabled={editando}
            />
          )}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field label="Código" htmlFor="obra-codigo" error={erros.codigo?.message}>
          <Input id="obra-codigo" autoComplete="off" {...register("codigo")} />
        </Field>
        <Field label="Nome" htmlFor="obra-nome" error={erros.nome?.message}>
          <Input id="obra-nome" autoComplete="off" {...register("nome")} />
        </Field>
      </div>
      <Field label="Situação" htmlFor="obra-status" error={erros.status?.message}>
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <SelectField
              id="obra-status"
              value={field.value}
              onChange={field.onChange}
              options={OBRA_STATUS.map((s) => ({ value: s, label: OBRA_STATUS_LABEL[s] }))}
            />
          )}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Início" htmlFor="obra-inicio" error={erros.dataInicio?.message}>
          <Input id="obra-inicio" type="date" {...register("dataInicio")} />
        </Field>
        <Field label="Fim previsto" htmlFor="obra-fim" error={erros.dataFimPrevista?.message}>
          <Input id="obra-fim" type="date" {...register("dataFimPrevista")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Cidade" htmlFor="obra-cidade" error={erros.cidade?.message}>
          <Input id="obra-cidade" autoComplete="off" {...register("cidade")} />
        </Field>
        <Field label="UF" htmlFor="obra-uf" error={erros.uf?.message}>
          <Controller
            control={control}
            name="uf"
            render={({ field }) => (
              <SelectField
                id="obra-uf"
                value={field.value}
                onChange={field.onChange}
                options={UFS.map((u) => ({ value: u, label: u }))}
                placeholder="—"
              />
            )}
          />
        </Field>
      </div>
    </FormDialog>
  );
}
