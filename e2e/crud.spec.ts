import { expect, test } from "@playwright/test";
import { entrar, escolher, sufixo } from "./helpers";
import { E2E } from "./users";

test.describe("cadastros do administrador", () => {
  test("empresa, categorias, obra, etapa, orçamento e lançamento (do início ao fim)", async ({ page }) => {
    const s = sufixo();
    const empresa = `E2E Construtora ${s}`;
    const obraNome = `Obra ${s}`;
    await entrar(page, E2E.admin.email);

    // --- Empresa (com validação de CNPJ) ---
    await page.goto("/admin/empresas");
    await page.getByRole("button", { name: "Nova empresa" }).click();
    await page.getByLabel("Nome", { exact: true }).fill(empresa);
    await page.getByLabel("CNPJ").fill("123");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("CNPJ inválido")).toBeVisible();
    await page.getByLabel("CNPJ").fill("11.222.333/0001-81");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Empresa criada.")).toBeVisible();
    await expect(page.getByRole("cell", { name: empresa, exact: true })).toBeVisible();
    await expect(page.getByText("11.222.333/0001-81").first()).toBeVisible();

    // --- Categorias padrão para a nova empresa ---
    await page.goto("/admin/categorias");
    await page.getByRole("button", { name: "Categorias padrão" }).click();
    await escolher(page, "Empresa", empresa);
    await page.getByRole("button", { name: "Criar categorias" }).click();
    await expect(page.getByText("Categorias padrão aplicadas.")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Materiais de construção", exact: true }).first()).toBeVisible();

    // --- Obra ---
    await page.goto("/obras");
    await page.getByRole("button", { name: "Nova obra" }).click();
    await escolher(page, "Empresa", empresa);
    await page.getByLabel("Código").fill(`T-${s}`);
    await page.getByLabel("Nome", { exact: true }).fill(obraNome);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Obra criada.")).toBeVisible();
    await page.getByRole("link", { name: obraNome }).click();
    await expect(page.getByRole("heading", { name: new RegExp(obraNome) })).toBeVisible();

    // --- Etapa ---
    await page.getByRole("link", { name: "Etapas" }).click();
    await page.getByRole("button", { name: "Nova etapa" }).click();
    await page.getByLabel("Código").fill("01");
    await page.getByLabel("Nome", { exact: true }).fill("Fundação");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Etapa criada.")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Fundação", exact: true })).toBeVisible();

    // --- Orçamento ---
    await page.getByRole("link", { name: "Orçamento" }).click();
    await page.getByRole("button", { name: "Novo item" }).click();
    await escolher(page, "Etapa", /Fundação/);
    await escolher(page, "Categoria", "Materiais de construção");
    await page.getByLabel("Valor previsto (R$)").fill("1.500.000,00");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Item criado.")).toBeVisible();
    await expect(page.getByText(/1\.500\.000,00/).first()).toBeVisible();

    // --- Lançamento (com validação) ---
    await page.getByRole("link", { name: "Lançamentos" }).click();
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Informe uma data válida")).toBeVisible();
    await expect(page.getByText("Escolha a categoria")).toBeVisible();

    await page.getByLabel("Valor (R$)").fill("12.345,67");
    await page.getByLabel("Competência", { exact: true }).fill("2026-03-10");
    await page.getByLabel("Pagamento").fill("2026-03-12");
    await escolher(page, "Categoria", "Materiais de construção");
    await page.getByLabel("Fornecedor").fill("Cimento Forte");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Lançamento criado.")).toBeVisible();
    await expect(page.getByRole("cell", { name: /Cimento Forte/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: /12\.345,67/ })).toBeVisible();

    // O resumo da obra reflete o lançamento e o orçamento.
    await page.getByRole("link", { name: "Resumo" }).click();
    await expect(page.getByText(/1\.500\.000,00/).first()).toBeVisible();
    await expect(page.getByText(/12\.345,67/).first()).toBeVisible();

    // --- Excluir o lançamento manual ---
    await page.getByRole("link", { name: "Lançamentos" }).click();
    await page.getByRole("button", { name: "Excluir lançamento" }).click();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByText("Lançamento excluído.")).toBeVisible();
    await expect(page.getByText("Nenhum lançamento encontrado.")).toBeVisible();

    // --- A obra, agora sem lançamentos, pode ser excluída ---
    await page.goto("/obras");
    await page.getByRole("button", { name: `Excluir ${obraNome}` }).click();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByText("Obra excluída.")).toBeVisible();
  });

  test("obra com lançamento não pode ser excluída: mostra o motivo", async ({ page }) => {
    const s = sufixo();
    const obraNome = `Obra Protegida ${s}`;
    await entrar(page, E2E.admin.email);

    await page.goto("/obras");
    await page.getByRole("button", { name: "Nova obra" }).click();
    await escolher(page, "Empresa", E2E.empresa.nome);
    await page.getByLabel("Código").fill(`P-${s}`);
    await page.getByLabel("Nome", { exact: true }).fill(obraNome);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Obra criada.")).toBeVisible();

    await page.getByRole("link", { name: obraNome }).click();
    await page.getByRole("link", { name: "Lançamentos" }).click();
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await page.getByLabel("Valor (R$)").fill("100,00");
    await page.getByLabel("Competência", { exact: true }).fill("2026-03-10");
    await page.getByLabel("Pagamento").fill("2026-03-12");
    await escolher(page, "Categoria", "Materiais de construção");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Lançamento criado.")).toBeVisible();

    await page.goto("/obras");
    await page.getByRole("button", { name: `Excluir ${obraNome}` }).click();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByText(/A obra tem 1 lançamento/)).toBeVisible();
    // Continua na lista.
    await expect(page.getByRole("link", { name: obraNome })).toBeVisible();
  });

  test("data inválida de obra e fim antes do início são recusados", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto("/obras");
    await page.getByRole("button", { name: "Nova obra" }).click();
    await escolher(page, "Empresa", E2E.empresa.nome);
    await page.getByLabel("Código").fill("X-1");
    await page.getByLabel("Nome", { exact: true }).fill("Obra datas");
    await page.getByLabel("Início").fill("2026-06-01");
    await page.getByLabel("Fim previsto").fill("2026-01-01");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("O fim previsto não pode ser antes do início")).toBeVisible();
  });
});

test.describe("usuários", () => {
  test("administrador cria um cliente com uma obra liberada; ele entra e só vê essa obra", async ({ page, browser }) => {
    const s = sufixo();
    const email = `cli-${s}@rgo.test`;
    await entrar(page, E2E.admin.email);

    // Descobre o id da obra reservada (A2) para provar o bloqueio por URL direta.
    await page.goto("/obras");
    const hrefA2 = await page.getByRole("link", { name: E2E.obras.a2.nome }).getAttribute("href");
    expect(hrefA2).toMatch(/^\/obras\/[0-9a-f-]{36}$/);

    await page.goto("/admin/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Cliente Criado");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha inicial").fill("SenhaInicial123");
    await escolher(page, "Empresa", E2E.empresa.nome);
    await page.getByRole("checkbox").first().waitFor();
    await page.getByLabel(new RegExp(E2E.obras.a1.codigo)).check();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Acesso criado.")).toBeVisible();
    await expect(page.getByRole("cell", { name: email })).toBeVisible();

    // O novo cliente entra (contexto limpo, sem a sessão do admin).
    const contexto = await browser.newContext();
    const clientePage = await contexto.newPage();
    await clientePage.goto("http://localhost:3000/login");
    await clientePage.getByLabel("E-mail", { exact: true }).fill(email);
    await clientePage.getByLabel("Senha").fill("SenhaInicial123");
    await clientePage.getByRole("button", { name: "Entrar" }).click();
    await expect(clientePage).toHaveURL(/\/(dashboard|e\/)/);

    await clientePage.goto("http://localhost:3000/obras");
    await expect(clientePage.getByRole("link", { name: E2E.obras.a1.nome })).toBeVisible();
    await expect(clientePage.getByRole("link", { name: E2E.obras.a2.nome })).toHaveCount(0);
    await clientePage.goto(`http://localhost:3000${hrefA2}`);
    await expect(clientePage.getByText("Obra não encontrada")).toBeVisible();
    await contexto.close();
  });

  test("e-mail repetido mostra erro; administrador não pode se desativar", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto("/admin/administradores");
    await page.getByRole("button", { name: "Novo administrador" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Repetido");
    await page.getByLabel("E-mail", { exact: true }).fill(E2E.empresaUser.email);
    await page.getByLabel("Senha inicial").fill("SenhaInicial123");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Este e-mail já está cadastrado.").first()).toBeVisible();
  });
});
