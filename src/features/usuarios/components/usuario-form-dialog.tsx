"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  type Control,
  Controller,
  type Resolver,
  type UseFormReturn,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { Field } from "@/components/form/field";
import { FormDialog } from "@/components/form/form-dialog";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { UsuarioRow } from "@/features/auth/usuarios-admin";
import { atualizarUsuarioAction, criarUsuarioAction } from "../actions";
import { type AtualizarUsuarioInput, atualizarUsuarioSchema, criarUsuarioSchema } from "../schema";

type FormValues = AtualizarUsuarioInput & { senha?: string };

export type EmpresaOpcao = { id: string; nome: string };
export type ObraOpcao = { id: string; codigo: string; nome: string };

const PAPEIS = [
  { value: "empresa", label: "Empresa (vê todas as obras da empresa)" },
  { value: "cliente", label: "Cliente (só as obras liberadas)" },
];

/** Um vínculo do usuário com uma empresa: perfil e, para cliente, as obras liberadas. */
function VinculoItem({
  index,
  form,
  control,
  empresas,
  obrasPorEmpresa,
  onRemove,
}: {
  index: number;
  form: UseFormReturn<FormValues>;
  control: Control<FormValues>;
  empresas: EmpresaOpcao[];
  obrasPorEmpresa: Record<string, ObraOpcao[]>;
  onRemove: () => void;
}) {
  const empresaId = useWatch({ control, name: `vinculos.${index}.empresaId` });
  const papel = useWatch({ control, name: `vinculos.${index}.papel` });
  const obras = obrasPorEmpresa[empresaId] ?? [];
  const erro = form.formState.errors.vinculos?.[index];

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Empresa" htmlFor={`vinculo-${index}-empresa`} error={erro?.empresaId?.message}>
          <Controller
            control={control}
            name={`vinculos.${index}.empresaId`}
            render={({ field }) => (
              <SelectField
                id={`vinculo-${index}-empresa`}
                value={field.value}
                onChange={(v) => {
                  field.onChange(v);
                  form.setValue(`vinculos.${index}.obraIds`, []);
                }}
                options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
                invalid={!!erro?.empresaId}
              />
            )}
          />
        </Field>
        <Field label="Perfil" htmlFor={`vinculo-${index}-papel`}>
          <Controller
            control={control}
            name={`vinculos.${index}.papel`}
            render={({ field }) => (
              <SelectField id={`vinculo-${index}-papel`} value={field.value} onChange={field.onChange} options={PAPEIS} />
            )}
          />
        </Field>
        <Button type="button" variant="ghost" size="icon" aria-label="Remover empresa" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>

      {papel === "cliente" && (
        <div className="grid gap-2">
          <span className="text-sm font-medium">Obras liberadas</span>
          {!empresaId ? (
            <p className="text-xs text-muted-foreground">Escolha a empresa para ver as obras.</p>
          ) : obras.length === 0 ? (
            <p className="text-xs text-muted-foreground">Esta empresa ainda não tem obras cadastradas.</p>
          ) : (
            <Controller
              control={control}
              name={`vinculos.${index}.obraIds`}
              render={({ field }) => (
                <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border p-2">
                  {obras.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={field.value.includes(o.id)}
                        onCheckedChange={(marcado) =>
                          field.onChange(marcado ? [...field.value, o.id] : field.value.filter((id) => id !== o.id))
                        }
                      />
                      <span>
                        {o.codigo} — {o.nome}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function UsuarioFormDialog({
  usuario,
  empresas,
  obrasPorEmpresa,
  meuId,
}: {
  usuario?: UsuarioRow;
  empresas: EmpresaOpcao[];
  obrasPorEmpresa: Record<string, ObraOpcao[]>;
  meuId: string;
}) {
  const editando = !!usuario;
  const form = useForm<FormValues>({
    resolver: zodResolver(editando ? atualizarUsuarioSchema : criarUsuarioSchema) as Resolver<FormValues>,
    defaultValues: {
      nome: usuario?.nome ?? "",
      email: usuario?.email ?? "",
      senha: "",
      admin: usuario?.admin ?? false,
      ativo: usuario?.ativo ?? true,
      vinculos:
        usuario?.vinculos.map((v) => ({ empresaId: v.empresaId, papel: v.papel, obraIds: v.obraIds })) ??
        (empresas.length === 1 ? [{ empresaId: empresas[0]!.id, papel: "empresa" as const, obraIds: [] }] : []),
    },
  });
  const { register, control, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "vinculos" });
  const admin = useWatch({ control, name: "admin" });
  const sou = usuario?.id === meuId;
  const erroVinculos = formState.errors.vinculos?.message ?? formState.errors.vinculos?.root?.message;

  return (
    <FormDialog
      form={form}
      title={editando ? "Editar usuário" : "Novo usuário"}
      description="Administrador enxerga tudo. Empresa e Cliente têm acesso somente leitura."
      successMessage={editando ? "Usuário atualizado." : "Usuário criado."}
      action={(values) => {
        const { senha, ...dados } = values;
        return editando ? atualizarUsuarioAction(usuario.id, dados) : criarUsuarioAction({ ...dados, senha });
      }}
      onSuccess={() => !editando && form.reset()}
      trigger={
        editando ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${usuario.nome}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Novo usuário
          </Button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="usuario-nome" error={formState.errors.nome?.message}>
          <Input id="usuario-nome" autoComplete="off" {...register("nome")} />
        </Field>
        <Field label="E-mail" htmlFor="usuario-email" error={formState.errors.email?.message}>
          <Input id="usuario-email" type="email" autoComplete="off" {...register("email")} />
        </Field>
      </div>

      {!editando && (
        <Field
          label="Senha inicial"
          htmlFor="usuario-senha"
          error={formState.errors.senha?.message}
          hint="Mínimo de 8 caracteres. Informe ao usuário por um canal seguro."
        >
          <Input id="usuario-senha" type="password" autoComplete="new-password" {...register("senha")} />
        </Field>
      )}

      <Controller
        control={control}
        name="admin"
        render={({ field }) => (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="grid gap-0.5">
              <span className="text-sm font-medium">Administrador</span>
              <span className="text-xs text-muted-foreground">
                Acesso total: empresas, usuários, obras, importações e integrações.
              </span>
            </div>
            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={sou} aria-label="Administrador" />
          </div>
        )}
      />

      {!admin && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Empresas e acesso</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ empresaId: "", papel: "empresa", obraIds: [] })}
            >
              <Plus />
              Adicionar empresa
            </Button>
          </div>
          {erroVinculos && (
            <p role="alert" className="text-sm text-destructive">
              {erroVinculos}
            </p>
          )}
          {fields.map((item, index) => (
            <VinculoItem
              key={item.id}
              index={index}
              form={form}
              control={control}
              empresas={empresas}
              obrasPorEmpresa={obrasPorEmpresa}
              onRemove={() => remove(index)}
            />
          ))}
        </div>
      )}

      <Controller
        control={control}
        name="ativo"
        render={({ field }) => (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="grid gap-0.5">
              <span className="text-sm font-medium">Usuário ativo</span>
              <span className="text-xs text-muted-foreground">
                Desativar encerra as sessões abertas e bloqueia novos logins.
              </span>
            </div>
            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={sou} aria-label="Usuário ativo" />
          </div>
        )}
      />
    </FormDialog>
  );
}
