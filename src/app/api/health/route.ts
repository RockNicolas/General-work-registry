import { getPool } from "@/server/db/client";

export async function GET() {
  let db: "up" | "down" = "down";
  try {
    await getPool().query("select 1");
    db = "up";
  } catch (error) {
    // Detalhes só no log do servidor; a resposta não vaza host nem credenciais.
    const code = (error as { code?: string } | null)?.code;
    const reason = error instanceof Error && error.message ? error.message : (code ?? "desconhecido");
    console.error("[health] banco indisponível:", reason);
  }

  return Response.json(
    { status: db === "up" ? "ok" : "degraded", db },
    { status: db === "up" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
