import { expect, test } from "@playwright/test";

test("home carrega em pt-BR", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/RGO/);
  await expect(page.getByRole("heading", { name: "Registro Geral de Obra" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
});

test("alterna o tema claro/escuro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole("button", { name: "Alternar tema claro/escuro" }).click();
  await expect(html).toHaveClass(/dark/);
});

test("health check responde com o banco no ar", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", db: "up" });
});
