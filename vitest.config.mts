import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Carrega o .env (sem sobrescrever variáveis já definidas no ambiente do processo).
try {
  process.loadEnvFile();
} catch {
  // sem .env
}
process.env.BETTER_AUTH_SECRET ??= "segredo-apenas-para-testes-0123456789abcdef";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "worker/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["**/*.int.test.ts", "node_modules/**"],
        },
      },
      {
        // Precisam de um Postgres real (DATABASE_URL): isolamento por RLS, upsert, etc.
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          globalSetup: ["./src/test/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
