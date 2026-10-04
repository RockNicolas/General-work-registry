"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field } from "@/components/form/field";
import { FormDialog } from "@/components/form/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { redefinirSenhaAction } from "../actions";
import { redefinirSenhaSchema } from "../schema";

type Values = z.infer<typeof redefinirSenhaSchema>;

export function RedefinirSenhaDialog({ usuarioId, nome }: { usuarioId: string; nome: string }) {
  const form = useForm<Values>({ resolver: zodResolver(redefinirSenhaSchema), defaultValues: { senha: "" } });

  return (
    <FormDialog
      form={form}
      title="Redefinir senha"
      description={`Define uma nova senha para ${nome}. As sessões abertas dele serão encerradas.`}
      submitLabel="Redefinir"
      successMessage="Senha redefinida."
      action={(values) => redefinirSenhaAction(usuarioId, values)}
      onSuccess={() => form.reset()}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Redefinir senha de ${nome}`}>
          <KeyRound />
        </Button>
      }
    >
      <Field label="Nova senha" htmlFor={`senha-${usuarioId}`} error={form.formState.errors.senha?.message}>
        <Input id={`senha-${usuarioId}`} type="password" autoComplete="new-password" {...form.register("senha")} />
      </Field>
    </FormDialog>
  );
}
