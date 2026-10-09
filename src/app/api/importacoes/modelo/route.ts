import { z } from "zod";
import { can } from "@/features/auth/policies";
import { getContextOrNull } from "@/features/auth/session";
import { gerarModeloCsv, gerarModeloXlsx } from "@/features/importacoes/gerar-modelo";
import { DATASETS, MODELO } from "@/features/importacoes/modelo";

export const runtime = "nodejs";

const consulta = z.object({
  formato: z.enum(["xlsx", "csv"]).default("xlsx"),
  dataset: z.enum(DATASETS).optional(),
});

/** Download do modelo vazio: .xlsx completo ou .csv de um conjunto de dados. */
export async function GET(request: Request) {
  const ctx = await getContextOrNull();
  if (!ctx || !can(ctx, "ver", "importacao")) return Response.json({ error: "Sem permissão." }, { status: 403 });

  const params = consulta.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!params.success) return Response.json({ error: "Parâmetros inválidos." }, { status: 400 });
  const { formato, dataset } = params.data;

  if (formato === "csv") {
    if (!dataset) return Response.json({ error: "Informe o conjunto de dados (dataset)." }, { status: 400 });
    return new Response(gerarModeloCsv(dataset) as BodyInit, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="modelo-${MODELO[dataset].aba.toLowerCase()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response((await gerarModeloXlsx()) as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-importacao-rgo.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
