import { Badge } from "@/components/ui/badge";
import { OBRA_STATUS_LABEL, type ObraStatus } from "@/lib/domain";

const VARIANTE: Record<ObraStatus, "default" | "secondary" | "outline"> = {
  ativa: "default",
  planejada: "secondary",
  pausada: "outline",
  concluida: "outline",
};

export function ObraStatusBadge({ status }: { status: ObraStatus }) {
  return <Badge variant={VARIANTE[status]}>{OBRA_STATUS_LABEL[status]}</Badge>;
}
