"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ListPlus, Pencil, Plus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Field } from "@/components/form/field";
import { FormDialog } from "@/components/form/form-dialog";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIA_GRUPOS, CATEGORIA_GRUPO_LABEL } from "@/lib/domain";
import { atualizarCategoriaAction, criarCategoriaAction, criarCategoriasPadraoAction } from "../actions";
import { type CategoriaInput, categoriaSchema, categoriasPadraoSchema } from "../schema";
import type { CategoriaRow } from "../service";

type Empresa = { id: string; nome: string };

export function CategoriaFormDialog({ categoria, empresas }: { categoria?: CategoriaRow; empresas: Empresa[] }) {
  const editando = !!categoria;
  const form = useForm<CategoriaInput>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: {
      empresaId: categoria?.empresaId ?? (empresas.length === 1 ? empresas[0]!.id : ""),
      nome: categoria?.nome ?? "",
      grupo: categoria?.grupo ?? "outros",
      codigoOrigem: categoria?.codigoOrigem ?? "",
    },
  });
  const { register, control, formState } = form;
  const erros = formState.errors;

  return (
    <FormDialog
      form={form}
      title={editando ? "Editar categoria" : "Nova categoria"}
      description="O grupo define em qual indicador a categoria entra (materiais, máquinas, mão de obra...)."
      successMessage={editando ? "Categoria atualizada." : "Categoria criada."}
      action={(values) => (editando ? atualizarCategoriaAction(categoria.id, values) : criarCategoriaAction(values))}
      onSuccess={() => !editando && form.reset()}
      trigger={
        editando ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${categoria.nome}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Nova categoria
          </Button>
        )
      }
    >
      <Field label="Empresa" htmlFor="cat-empresa" error={erros.empresaId?.message}>
        <Controller
          control={control}
          name="empresaId"
          render={({ field }) => (
            <SelectField
              id="cat-empresa"
              value={field.value}
              onChange={field.onChange}
              options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
              invalid={!!erros.empresaId}
              disabled={editando}
            />
          )}
        />
      </Field>
      <Field label="Nome" htmlFor="cat-nome" error={erros.nome?.message}>
        <Input id="cat-nome" autoComplete="off" {...register("nome")} />
      </Field>
      <Field label="Grupo" htmlFor="cat-grupo" error={erros.grupo?.message}>
        <Controller
          control={control}
          name="grupo"
          render={({ field }) => (
            <SelectField
              id="cat-grupo"
              value={field.value}
              onChange={field.onChange}
              options={CATEGORIA_GRUPOS.map((g) => ({ value: g, label: CATEGORIA_GRUPO_LABEL[g] }))}
            />
          )}
        />
      </Field>
      <Field
        label="Código no ERP"
        htmlFor="cat-codigo"
        error={erros.codigoOrigem?.message}
        hint="Opcional. Usado para mapear a categoria na sincronização."
      >
        <Input id="cat-codigo" autoComplete="off" {...register("codigoOrigem")} />
      </Field>
    </FormDialog>
  );
}

export function CategoriasPadraoDialog({ empresas }: { empresas: Empresa[] }) {
  const form = useForm<{ empresaId: string }>({
    resolver: zodResolver(categoriasPadraoSchema),
    defaultValues: { empresaId: empresas.length === 1 ? empresas[0]!.id : "" },
  });

  return (
    <FormDialog
      form={form}
      title="Categorias padrão"
      description="Cria o conjunto inicial de categorias (materiais, máquinas, mão de obra, serviços, receita). As que já existem são mantidas."
      submitLabel="Criar categorias"
      successMessage="Categorias padrão aplicadas."
      action={(values) => criarCategoriasPadraoAction(values)}
      trigger={
        <Button variant="outline">
          <ListPlus />
          Categorias padrão
        </Button>
      }
    >
      <Field label="Empresa" htmlFor="padrao-empresa" error={form.formState.errors.empresaId?.message}>
        <Controller
          control={form.control}
          name="empresaId"
          render={({ field }) => (
            <SelectField
              id="padrao-empresa"
              value={field.value}
              onChange={field.onChange}
              options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
            />
          )}
        />
      </Field>
    </FormDialog>
  );
}
