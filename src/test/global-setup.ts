import { describeError, runMigrations } from "../server/db/migrate";

/** Roda uma vez antes da suíte de integração: garante o schema atualizado no banco de teste. */
export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL ausente: os testes de integração precisam de um Postgres real " +
        "(branch develop do Neon ou um Postgres local). Veja o README.",
    );
  }

  const host = new URL(url).hostname;
  if (host.includes("-pooler")) {
    throw new Error("Use a conexão DIRETA do Neon (host sem '-pooler') nos testes de integração.");
  }
  console.log(`[testes de integração] banco: ${host}`);

  try {
    await runMigrations(url);
  } catch (error) {
    throw new Error(`Falha ao preparar o banco de teste:\n  ${describeError(error)}`);
  }
}
