import { Badge } from "@/components/ui/badge";
import type { ImportacaoStatus } from "@/lib/domain";

const TEXTO: Record<ImportacaoStatus, string> = {
  previa: "Aguardando confirmação",
  processando: "Processando",
  concluida: "Concluída",
  concluida_com_erros: "Concluída com erros",
  falhou: "Falhou",
};

const VARIANTE: Record<ImportacaoStatus, "default" | "secondary" | "outline" | "destructive"> = {
  previa: "secondary",
  processando: "secondary",
  concluida: "default",
  concluida_com_erros: "default",
  falhou: "destructive",
};

export function ImportacaoStatusBadge({ status }: { status: ImportacaoStatus }) {
  return <Badge variant={VARIANTE[status]}>{TEXTO[status]}</Badge>;
}
