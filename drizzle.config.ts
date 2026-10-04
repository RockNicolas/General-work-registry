import { defineConfig } from "drizzle-kit";

// drizzle-kit não carrega o .env sozinho.
try {
  process.loadEnvFile();
} catch {
  // sem .env: usa o ambiente do processo (CI, Docker)
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
