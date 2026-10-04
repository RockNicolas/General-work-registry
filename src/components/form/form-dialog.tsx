"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";

type Props<T extends FieldValues> = {
  title: string;
  description?: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  form: UseFormReturn<T>;
  action: (values: T) => Promise<ActionResult<unknown>>;
  successMessage?: string;
  submitLabel?: string;
  onSuccess?: () => void;
  children: ReactNode;
};

/**
 * Diálogo de formulário: envia por Server Action, mostra erro geral e por campo (vindos do
 * servidor), avisa com toast e recarrega os dados da página ao concluir.
 */
export function FormDialog<T extends FieldValues>({
  title,
  description,
  trigger,
  open: openProp,
  onOpenChange,
  form,
  action,
  successMessage = "Salvo com sucesso.",
  submitLabel = "Salvar",
  onSuccess,
  children,
}: Props<T>) {
  const router = useRouter();
  const [openState, setOpenState] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const open = openProp ?? openState;

  function setOpen(next: boolean) {
    if (!next) setErro(null);
    (onOpenChange ?? setOpenState)(next);
  }

  const submit = form.handleSubmit(async (values) => {
    setErro(null);
    let result: ActionResult<unknown>;
    try {
      result = await action(values);
    } catch {
      setErro("Não foi possível concluir a operação. Tente novamente.");
      return;
    }
    if (!result.ok) {
      setErro(result.error);
      for (const [campo, mensagem] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(campo as Path<T>, { message: mensagem });
      }
      return;
    }
    toast.success(successMessage);
    setOpen(false);
    onSuccess?.();
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {erro && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
