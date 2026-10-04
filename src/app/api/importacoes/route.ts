import { z } from "zod";
import { getAdminContextOrNull } from "@/features/auth/session";
import { LIMITE_BYTES } from "@/features/importacoes/ler-arquivo";
import { DATASETS } from "@/features/importacoes/modelo";
import { criarPrevia } from "@/features/importacoes/service";
import { failFromError } from "@/server/actions";

export const runtime = "nodejs";

const erro = (mensagem: string, status: number, fieldErrors?: Record<string, string>) =>
  Response.json({ error: mensagem, fieldErrors }, { status });

/**
 * Recebe a planilha (multipart), valida e devolve o id da PRÉVIA. Nada é gravado nas tabelas de
 * negócio aqui: a gravação só acontece quando o administrador confirma a prévia.
 */
export async function POST(request: Request) {
  const ctx = await getAdminContextOrNull();
  if (!ctx) return erro("Sem permissão para esta operação. Entre novamente.", 403);

  // Recusa cedo, sem ler o corpo, o que já declara ser grande demais (folga p/ o multipart).
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > LIMITE_BYTES + 1024 * 1024) return erro("O arquivo passa do limite de 10 MB.", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return erro("Envio inválido. Selecione o arquivo e tente de novo.", 400);
  }

  const empresaId = String(form.get("empresaId") ?? "").trim();
  if (!empresaId) return erro("Escolha a empresa.", 400, { empresaId: "Escolha a empresa" });

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return erro("Selecione um arquivo .xlsx ou .csv.", 400, { arquivo: "Selecione um arquivo" });
  if (arquivo.size > LIMITE_BYTES) return erro("O arquivo passa do limite de 10 MB.", 413);

  const dataset = z.enum(DATASETS).safeParse(form.get("dataset") || undefined);
  const datasetCsv = dataset.success ? dataset.data : undefined;

  try {
    const { id } = await criarPrevia(ctx, {
      empresaId,
      arquivoNome: arquivo.name,
      bytes: new Uint8Array(await arquivo.arrayBuffer()),
      datasetCsv,
    });
    return Response.json({ id });
  } catch (e) {
    const r = failFromError(e);
    return r.ok ? erro("Falha ao processar o arquivo.", 500) : erro(r.error, 400, r.fieldErrors);
  }
}
