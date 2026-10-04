import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile();
} catch {
  // sem .env: usa o ambiente do processo
}
// O servidor de dev herda este ambiente; o segredo só precisa existir e ter 32+ caracteres.
process.env.BETTER_AUTH_SECRET ??= "segredo-apenas-para-e2e-0123456789abcdef";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  timeout: 60_000,
  // O `next dev` compila cada rota na primeira visita; folga para esse custo.
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
