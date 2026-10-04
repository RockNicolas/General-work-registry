"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

/** Confirmação antes de uma ação destrutiva (ex.: excluir). Mostra o erro do servidor em toast. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Excluir",
  successMessage = "Concluído.",
  action,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  successMessage?: string;
  action: () => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendente, setPendente] = useState(false);

  async function confirmar() {
    setPendente(true);
    try {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        setOpen(false); // o motivo está no aviso; o diálogo não deve esconder a tela
        return;
      }
      toast.success(successMessage);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Não foi possível concluir a operação. Tente novamente.");
    } finally {
      setPendente(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={confirmar} disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
