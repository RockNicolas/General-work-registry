"use client";

import { History, Loader2, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { excluirIntegracaoAction, sincronizarAction, testarConexaoAction } from "../actions";
import type { DetalheIntegracao } from "../service";

type Pendente = "teste" | "incremental" | "historica" | null;

/** Botões do topo da integração: testar conexão, sincronizar, carga histórica, excluir. */
export function IntegracaoAcoes({ d }: { d: Pick<DetalheIntegracao, "id" | "nome" | "sincronizavel" | "status" | "totalVinculos"> }) {
  const router = useRouter();
  const [pendente, setPendente] = useState<Pendente>(null);

  async function executar(qual: Exclude<Pendente, null>) {
    setPendente(qual);
    try {
      if (qual === "teste") {
        const r = await testarConexaoAction(d.id);
        if (!r.ok) toast.error(r.error);
        else if (r.data.ok) toast.success(r.data.mensagem || "Conexão realizada com sucesso.");
        else toast.error(r.data.mensagem);
      } else {
        const r = await sincronizarAction(d.id, qual);
        if (!r.ok) toast.error(r.error);
        else toast.success(qual === "historica" ? "Carga histórica enfileirada." : "Sincronização enfileirada.");
      }
      router.refresh();
    } catch {
      toast.error("Não foi possível concluir a operação. Tente novamente.");
    } finally {
      setPendente(null);
    }
  }

  const ocupado = pendente !== null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => executar("teste")} disabled={ocupado}>
        {pendente === "teste" ? <Loader2 className="animate-spin" /> : <PlugZap />}
        Testar conexão
      </Button>
      {d.sincronizavel && (
        <>
          <Button onClick={() => executar("incremental")} disabled={ocupado || d.status === "pausada" || d.totalVinculos === 0}>
            {pendente === "incremental" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Sincronizar agora
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="outline" disabled={ocupado || d.status === "pausada" || d.totalVinculos === 0}>
                <History />
                Carga histórica
              </Button>
            }
            title="Executar a carga histórica?"
            description="Relê todo o período configurado (meses de histórico) do ERP. Pode levar vários minutos e respeita os limites de requisições do ERP; os dados já existentes são atualizados, não duplicados."
            confirmLabel="Executar"
            successMessage="Carga histórica enfileirada."
            action={() => sincronizarAction(d.id, "historica")}
          />
        </>
      )}
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon" aria-label={`Excluir ${d.nome}`}>
            <Trash2 />
          </Button>
        }
        title="Excluir integração?"
        description={`"${d.nome}" será excluída com os vínculos e o histórico de execuções. Se ela já gravou lançamentos, a exclusão é recusada para preservar o histórico.`}
        successMessage="Integração excluída."
        action={async () => {
          const r = await excluirIntegracaoAction(d.id);
          if (r.ok) router.push("/admin/integracoes");
          return r;
        }}
      />
    </div>
  );
}
