"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Field } from "@/components/form/field";
import { FormDialog } from "@/components/form/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatarCnpj } from "@/lib/cnpj";
import { atualizarEmpresaAction, criarEmpresaAction } from "../actions";
import { type EmpresaInput, empresaSchema } from "../schema";
import type { EmpresaRow } from "../service";

export function EmpresaFormDialog({ empresa }: { empresa?: EmpresaRow }) {
  const editando = !!empresa;
  const form = useForm<EmpresaInput>({
    resolver: zodResolver(empresaSchema),
    defaultValues: {
      nome: empresa?.nome ?? "",
      razaoSocial: empresa?.razaoSocial ?? "",
      cnpj: empresa?.cnpj ? formatarCnpj(empresa.cnpj) : "",
      ativo: empresa?.ativo ?? true,
    },
  });
  const { register, control, formState } = form;

  return (
    <FormDialog
      form={form}
      title={editando ? "Editar empresa" : "Nova empresa"}
      description="Cada empresa enxerga apenas as próprias obras."
      successMessage={editando ? "Empresa atualizada." : "Empresa criada."}
      action={(values) => (editando ? atualizarEmpresaAction(empresa.id, values) : criarEmpresaAction(values))}
      onSuccess={() => !editando && form.reset()}
      trigger={
        editando ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${empresa.nome}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Nova empresa
          </Button>
        )
      }
    >
      <Field label="Nome" htmlFor="empresa-nome" error={formState.errors.nome?.message}>
        <Input id="empresa-nome" autoComplete="off" aria-invalid={!!formState.errors.nome} {...register("nome")} />
      </Field>
      <Field label="Razão social" htmlFor="empresa-razao" error={formState.errors.razaoSocial?.message}>
        <Input id="empresa-razao" autoComplete="off" {...register("razaoSocial")} />
      </Field>
      <Field
        label="CNPJ"
        htmlFor="empresa-cnpj"
        error={formState.errors.cnpj?.message}
        hint="Opcional. Aceita o formato numérico e o alfanumérico."
      >
        <Input id="empresa-cnpj" autoComplete="off" placeholder="00.000.000/0000-00" {...register("cnpj")} />
      </Field>
      <Controller
        control={control}
        name="ativo"
        render={({ field }) => (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="grid gap-0.5">
              <span className="text-sm font-medium">Empresa ativa</span>
              <span className="text-xs text-muted-foreground">
                Inativa: os usuários vinculados perdem o acesso até a reativação.
              </span>
            </div>
            <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Empresa ativa" />
          </div>
        )}
      />
    </FormDialog>
  );
}
