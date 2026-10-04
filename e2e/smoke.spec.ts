import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./users";

async function entrar(page: Page, email: string, senha: string = E2E.senha) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.describe("autenticação", () => {
  test("quem não está logado vai para o login, preservando o destino", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  });

  test("senha errada mostra mensagem em português e não entra", async ({ page }) => {
    await entrar(page, E2E.admin.email, "senha-errada-123");
    await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos" })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("validação do formulário (e-mail inválido)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("isso-nao-e-email");
    await page.getByLabel("Senha").fill("x");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Informe um e-mail válido")).toBeVisible();
  });

  test("administrador entra, vê o painel e sai", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Olá, Ana" })).toBeVisible();

    await page.getByRole("button", { name: "Menu do usuário" }).click();
    await expect(page.getByText("Administrador")).toBeVisible();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);

    // Depois de sair, o painel volta a ser protegido.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redireciona para o destino pedido depois do login", async ({ page }) => {
    await page.goto("/login?next=%2Fdashboard");
    await page.getByLabel("E-mail").fill(E2E.admin.email);
    await page.getByLabel("Senha").fill(E2E.senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("não aceita redirecionamento para site externo (open redirect)", async ({ page }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example.com");
    await page.getByLabel("E-mail").fill(E2E.admin.email);
    await page.getByLabel("Senha").fill(E2E.senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/localhost:3000\/dashboard/);
  });
});

test.describe("perfis", () => {
  test("empresa vê o painel em modo leitura", async ({ page }) => {
    await entrar(page, E2E.empresaUser.email);
    await expect(page.getByRole("heading", { name: "Olá, Eva" })).toBeVisible();
    await expect(page.getByText("em modo leitura").first()).toBeVisible();
    await expect(page.getByText("1 empresa(s)")).toBeVisible();
  });

  test("cliente vê só o que foi liberado", async ({ page }) => {
    await entrar(page, E2E.clienteUser.email);
    await expect(page.getByRole("heading", { name: "Olá, Caio" })).toBeVisible();
    await expect(page.getByText("1 empresa(s) e 0 obra(s) liberada(s)")).toBeVisible();
  });

  test("usuário sem vínculo cai na tela de sem acesso", async ({ page }) => {
    await entrar(page, E2E.semVinculo.email);
    await expect(page.getByText("Sem acesso")).toBeVisible();
    await expect(page.getByText("não está vinculado a nenhuma empresa ativa")).toBeVisible();
  });
});

test.describe("segurança", () => {
  test("não existe cadastro público", async ({ request }) => {
    const res = await request.post("/api/auth/sign-up/email", {
      data: { email: "intruso@exemplo.com", password: "Senha-Forte-123", name: "Intruso" },
    });
    expect(res.ok()).toBe(false);
  });

  test("sem cookie, a sessão é nula", async ({ request }) => {
    const res = await request.get("/api/auth/get-session");
    expect(res.ok()).toBe(true);
    expect(await res.json()).toBeNull();
  });
});

test("alterna o tema claro/escuro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await entrar(page, E2E.admin.email);
  await expect(page).toHaveURL(/\/dashboard/);
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
