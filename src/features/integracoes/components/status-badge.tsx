import { Badge } from "@/components/ui/badge";
import type { IntegracaoStatus, SyncStatus } from "@/lib/domain";

const TEXTO_INTEGRACAO: Record<IntegracaoStatus, string> = {
  ativa: "Ativa",
  erro: "Com erro",
  pausada: "Pausada",
};

const VARIANTE_INTEGRACAO: Record<IntegracaoStatus, "default" | "secondary" | "destructive"> = {
  ativa: "default",
  erro: "destructive",
  pausada: "secondary",
};

export function IntegracaoStatusBadge({ status }: { status: IntegracaoStatus }) {
  return <Badge variant={VARIANTE_INTEGRACAO[status]}>{TEXTO_INTEGRACAO[status]}</Badge>;
}

export const SYNC_STATUS_TEXTO: Record<SyncStatus, string> = {
  enfileirada: "Na fila",
  executando: "Executando",
  concluida: "Concluída",
  concluida_com_erros: "Concluída com problemas",
  falhou: "Falhou",
};

const VARIANTE_SYNC: Record<SyncStatus, "default" | "secondary" | "destructive"> = {
  enfileirada: "secondary",
  executando: "secondary",
  concluida: "default",
  concluida_com_erros: "default",
  falhou: "destructive",
};

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  return <Badge variant={VARIANTE_SYNC[status]}>{SYNC_STATUS_TEXTO[status]}</Badge>;
}
