/**
 * Acorda o banco quando o servidor sobe, antes do primeiro clique.
 * O Neon em Ohio desliga sozinho; sem isso a primeira tela espera a conexão e cai.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { getPool } = await import("@/server/db/client");
    getPool();
  } catch (error) {
    console.error("[db] não foi possível abrir o pool na subida:", error);
  }
}
