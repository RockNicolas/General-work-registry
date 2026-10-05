import { enviarJobSyncPorWebhook } from "@/features/integracoes/fila";
import { autenticarWebhook } from "@/features/integracoes/service";

export const runtime = "nodejs";

const LIMITE_CORPO = 64 * 1024;
const resposta = (status: number, corpo: Record<string, unknown>) => Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Recebe os eventos do ERP (webhook). Autenticação: `Authorization: Bearer <segredo>` (o mesmo
 * "token" cadastrado no ERP; guardamos só o hash). O corpo NÃO é confiado: o evento apenas
 * dispara uma sincronização incremental, que lê os dados de verdade pela API do ERP.
 * Rajadas de eventos viram uma única sincronização (1 por minuto por integração).
 */
export async function POST(request: Request, { params }: RouteContext<"/api/webhooks/[erp]/[integracaoId]">) {
  const { erp, integracaoId } = await params;

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim() ?? null;
  const integ = erp === "sienge" ? await autenticarWebhook(integracaoId, token, "sienge") : null;
  // Mesma resposta para integração inexistente, ERP errado e segredo errado: não revela o que existe.
  if (!integ) return resposta(401, { error: "não autorizado" });

  // Drena (e descarta) o corpo, com teto de tamanho.
  const corpo = await request.text().catch(() => "");
  if (corpo.length > LIMITE_CORPO) return resposta(413, { error: "corpo grande demais" });

  if (integ.status === "pausada") return resposta(202, { status: "ignorado", motivo: "integração pausada" });

  try {
    const jobId = await enviarJobSyncPorWebhook(integ.id);
    return resposta(202, { status: jobId ? "enfileirado" : "ja_enfileirado" });
  } catch (erro) {
    console.error("[webhook] não foi possível enfileirar:", erro instanceof Error ? erro.message : erro);
    return resposta(503, { error: "fila indisponível" });
  }
}
