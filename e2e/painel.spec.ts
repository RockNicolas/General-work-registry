import { expect, test } from "@playwright/test";
import { entrar } from "./helpers";
import { E2E } from "./users";

const { painel } = E2E;
const URL_PAINEL = `/dashboard?empresa=${painel.id}`;

/** O cartão (KPI ou seção) cujo texto contém o título. */
const cartao = (page: import("@playwright/test").Page, titulo: string | RegExp) => page.locator("[data-slot=card]", { hasText: titulo }).first();

test.describe("painel de indicadores", () => {
  test("administrador: números do período, tabela por obra, grupos, vencimentos e gráficos", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto(URL_PAINEL);
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();

    // KPIs (só operacional: o aporte de R$ 5.000 não é receita).
    await expect(cartao(page, "Receita realizada")).toContainText("R$ 8.000,00");
    await expect(cartao(page, "Receita realizada")).toContainText("A receber: R$ 3.000,00");
    await expect(cartao(page, "Custo realizado")).toContainText("R$ 2.500,00");
    await expect(cartao(page, "Custo realizado")).toContainText("A pagar: R$ 1.700,00");
    await expect(cartao(page, "Margem realizada")).toContainText("R$ 5.500,00");
    await expect(cartao(page, "Margem realizada")).toContainText("68,75% da receita");
    await expect(cartao(page, "Margem realizada")).toContainText("projetada: R$ 6.800,00 (61,82%)");
    await expect(cartao(page, "Obras")).toContainText("1 ativa(s)");

    // Orçado × comprometido × incorrido da obra.
    const linha = page.getByRole("row", { name: new RegExp(painel.obra.codigo) });
    await expect(linha).toBeVisible();
    await expect(linha).toContainText("R$ 10.000,00"); // orçado
    await expect(linha).toContainText("R$ 4.200,00"); // comprometido = 2.500 + 1.000 + 700
    await expect(linha).toContainText("42,00%");
    await expect(linha).toContainText("-R$ 5.800,00 (-58,00%)"); // abaixo do orçado: sem destaque de alerta
    await expect(linha).toContainText("68,75%"); // margem realizada

    // Grupos: materiais com 35% do orçado comprometido (3.500 de 10.000).
    await expect(page.getByText("35,00%", { exact: true }).first()).toBeVisible();

    // Vencimentos: 1.700 a pagar (1.000 efetivo + 700 de previsão) e 3.000 a receber.
    await expect(cartao(page, "Contas a pagar por vencimento")).toContainText("Total a vencer: R$ 1.700,00");
    await expect(cartao(page, "Contas a receber por vencimento")).toContainText("Total a vencer: R$ 3.000,00");

    // Fora da margem: o aporte aparece à parte.
    await expect(cartao(page, "Fora da margem")).toContainText("Aporte (entrada)");
    await expect(cartao(page, "Fora da margem")).toContainText("R$ 5.000,00");

    // Gráficos de verdade (SVG do Recharts) e acessíveis por nome.
    await expect(page.getByRole("img", { name: /Receita, custo e margem realizados/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "Contas a pagar por faixa de vencimento" })).toBeVisible();
    await expect.poll(() => page.locator("svg.recharts-surface").count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(5);
  });

  test("período: o resultado muda, mas o orçado e o acumulado continuam; filtros ficam na URL", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto("/dashboard");

    // Por nome do campo: o rótulo de um <select> inclui o texto das opções, então getByLabel é ambíguo.
    await page.locator("select[name=empresa]").selectOption({ label: painel.nome });
    await page.locator("input[name=de]").fill("2020-01");
    await page.locator("input[name=ate]").fill("2020-03");
    await page.getByRole("button", { name: "Aplicar" }).click();

    await expect(page).toHaveURL(new RegExp(`empresa=${painel.id}`));
    await expect(page).toHaveURL(/de=2020-01/);
    await expect(page).toHaveURL(/ate=2020-03/);
    // Em 2020 não há lançamentos: resultado zerado...
    await expect(cartao(page, "Receita realizada")).toContainText("R$ 0,00");
    await expect(cartao(page, "Margem realizada")).toContainText("Sem receita no período");
    // ...mas a obra e o orçamento continuam na tabela (comprometido acumulado até mar/2020 = 0).
    const linha = page.getByRole("row", { name: new RegExp(painel.obra.codigo) });
    await expect(linha).toContainText("R$ 10.000,00");
    await expect(linha).toContainText("0,00%");
    await expect(page.getByRole("link", { name: "Limpar" })).toBeVisible();
  });

  test("filtro por grupo de custo restringe lançamentos e orçamento", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto(`${URL_PAINEL}&grupo=mao_obra_direta`);
    // Só mão de obra direta: R$ 700 a pagar, nenhum custo realizado, orçamento (que é de materiais) fora.
    await expect(cartao(page, "Custo realizado")).toContainText("A pagar: R$ 700,00");
    await expect(cartao(page, "Receita realizada")).toContainText("R$ 0,00");
    await expect(page.getByRole("row", { name: new RegExp(painel.obra.codigo) })).toContainText("sem orçamento");
  });

  test("parâmetros inválidos na URL não quebram a página", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    const r = await page.goto("/dashboard?de=lixo&ate=2026-99&obra=nao-e-uuid&grupo=inexistente&empresa=");
    expect(r?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Aplicar" })).toBeVisible();
  });

  test("empresa só enxerga as próprias obras: pedir a empresa do painel pela URL não mostra nada", async ({ page }) => {
    await entrar(page, E2E.empresaUser.email);

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: new RegExp(E2E.obras.a1.codigo) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(E2E.painel.obra.codigo) })).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(E2E.obras.b1.codigo) })).toHaveCount(0);
    await expect(page.getByText(painel.nome)).toHaveCount(0); // nem como opção de filtro

    await page.goto(URL_PAINEL);
    await expect(cartao(page, "Obras")).toContainText("0");
    await expect(cartao(page, "Receita realizada")).toContainText("R$ 0,00");
    await expect(page.getByText("R$ 8.000,00")).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(painel.obra.codigo) })).toHaveCount(0);
  });

  test("cliente só enxerga a obra liberada, e o painel dela abre pela aba da obra", async ({ page }) => {
    await entrar(page, E2E.clienteUser.email);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: new RegExp(E2E.obras.a1.codigo) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(E2E.obras.a2.codigo) })).toHaveCount(0);
    await expect(cartao(page, "Obras")).toContainText("1");

    await page.getByRole("link", { name: new RegExp(E2E.obras.a1.codigo) }).click();
    await expect(page.getByRole("heading", { name: new RegExp(E2E.obras.a1.nome) })).toBeVisible();
    await page.getByRole("link", { name: /Painel da obra/ }).click();
    await expect(page).toHaveURL(/\/dashboard\?obra=[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  });
});
