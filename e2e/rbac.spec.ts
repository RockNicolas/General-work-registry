import { expect, test } from "@playwright/test";
import { entrar } from "./helpers";
import { E2E } from "./users";

/** Pega, como administrador, o caminho (/obras/<id>) de cada obra fixa do e2e. */
async function caminhosDasObras(browser: import("@playwright/test").Browser) {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await page.goto("http://localhost:3000/login");
  await page.getByLabel("E-mail").fill(E2E.admin.email);
  await page.getByLabel("Senha").fill(E2E.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("http://localhost:3000/obras");

  const caminho = async (nome: string) => (await page.getByRole("link", { name: nome }).first().getAttribute("href"))!;
  const resultado = {
    a1: await caminho(E2E.obras.a1.nome),
    a2: await caminho(E2E.obras.a2.nome),
    b1: await caminho(E2E.obras.b1.nome),
  };
  await contexto.close();
  return resultado;
}

test.describe("isolamento entre perfis (pela interface)", () => {
  test("administrador vê as obras de todas as empresas e o menu de administração", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto("/obras");
    for (const o of [E2E.obras.a1, E2E.obras.a2, E2E.obras.b1]) {
      await expect(page.getByRole("link", { name: o.nome })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Nova obra" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Obras", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clientes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Categorias" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Empresas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Auditoria" })).toBeVisible();
  });

  test("empresa vê só as próprias obras, sem criar/editar e sem menu de administração", async ({ page, browser }) => {
    const caminhos = await caminhosDasObras(browser);
    await entrar(page, E2E.empresaUser.email);

    await page.goto("/obras");
    await expect(page.getByRole("link", { name: E2E.obras.a1.nome })).toBeVisible();
    await expect(page.getByRole("link", { name: E2E.obras.a2.nome })).toBeVisible();
    await expect(page.getByRole("link", { name: E2E.obras.b1.nome })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nova obra" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Excluir/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Obras", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Categorias" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Empresas" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Análises" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Importar Excel" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Integração" })).toBeVisible();

    // Obra de outra empresa por URL direta: não existe para este usuário.
    await page.goto(caminhos.b1);
    await expect(page.getByText("Obra não encontrada")).toBeVisible();

    // Obra própria abre, em modo leitura (sem botões de edição).
    await page.goto(caminhos.a1);
    await expect(page.getByRole("heading", { name: new RegExp(E2E.obras.a1.nome) })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar obra" })).toHaveCount(0);
    await page.goto(`${caminhos.a1}/lancamentos`);
    await expect(page.getByRole("button", { name: "Novo lançamento" })).toHaveCount(0);
  });

  test("áreas de administração dão 404 para quem não é administrador", async ({ page }) => {
    await entrar(page, E2E.empresaUser.email);
    for (const rota of ["/admin/empresas", "/admin/usuarios", "/admin/clientes", "/admin/categorias", "/admin/auditoria"]) {
      const resposta = await page.goto(rota);
      expect(resposta?.status(), rota).toBe(404);
    }
  });

  test("cliente vê só a obra liberada e não abre a outra da mesma empresa", async ({ page, browser }) => {
    const caminhos = await caminhosDasObras(browser);
    await entrar(page, E2E.clienteUser.email);

    await page.goto("/obras");
    await expect(page.getByRole("link", { name: "Obras", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Importar Excel" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Integração" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: E2E.obras.a1.nome })).toBeVisible();
    await expect(page.getByRole("link", { name: E2E.obras.a2.nome })).toHaveCount(0);
    await expect(page.getByRole("link", { name: E2E.obras.b1.nome })).toHaveCount(0);

    await page.goto(caminhos.a2);
    await expect(page.getByText("Obra não encontrada")).toBeVisible();
    await page.goto(caminhos.b1);
    await expect(page.getByText("Obra não encontrada")).toBeVisible();
  });
});
