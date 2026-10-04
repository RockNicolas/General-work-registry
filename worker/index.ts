import { PgBoss } from "pg-boss";
import { getEnv } from "@/server/env";

// Processo separado do Next: consome as filas do pg-boss (sincronização ERP, Fase 5).
async function main() {
  const boss = new PgBoss(getEnv().DATABASE_URL);
  boss.on("error", (error) => console.error("[worker] erro no pg-boss:", error));

  await boss.start();
  console.log("[worker] pg-boss iniciado; aguardando filas (nenhuma registrada ainda)");

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} recebido; encerrando`);
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[worker] falha ao iniciar:", error);
  process.exit(1);
});
