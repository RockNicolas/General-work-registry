import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile();
} catch {
  // sem .env: usa o ambiente do processo
}
// O servidor de dev herda este ambiente; o segredo só precisa existir e ter 32+ caracteres.
process.env.BETTER_AUTH_SECRET ??= "segredo-apenas-para-e2e-0123456789abcdef";
// Integrações: chave só para o e2e (32 bytes em base64) e permissão de endereço personalizado, para o
// servidor falar com o Sienge falso local. O flag vale só para o servidor que o Playwright sobe.
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.ERP_ALLOW_CUSTOM_BASE_URL = "true";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  // Poucos workers: cada um abre um navegador e o `next dev` já pesa; mais que isso só gera lentidão.
  workers: process.env.CI ? 2 : 2,
  timeout: 90_000,
  // O `next dev` compila cada rota na primeira visita; folga para esse custo.
  expect: { timeout: 20_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
