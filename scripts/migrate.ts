import { describeError, runMigrations } from "@/server/db/migrate";

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    // sem .env: usa o ambiente do processo
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL ausente. Copie .env.example para .env e preencha.");
    process.exit(1);
  }

  try {
    await runMigrations(url);
    console.log("Migrations aplicadas.");
  } catch (error) {
    console.error(`Falha ao aplicar migrations:\n  ${describeError(error)}`);
    process.exit(1);
  }
}

void main();
