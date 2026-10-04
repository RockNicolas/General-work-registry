import { expect, test } from "@playwright/test";
import { entrar, escolher, sufixo } from "./helpers";
import { E2E } from "./users";

const CABECALHO = "codigo_obra;tipo;data;valor;categoria;data_pagamento;descricao";

function csv(marcador: string) {
  return Buffer.from(
    [
      CABECALHO,
      `${E2E.obras.a1.codigo};custo;10/03/2026;1.234,56;Materiais de construção;12/03/2026;${marcador} um`,
      `${E2E.obras.a1.codigo};custo;31/02/2026;50,00;Materiais de construção;12/03/2026;${marcador} data inexistente`,
      `${E2E.obras.a1.codigo};custo;11/03/2026;2.000,00;Materiais de construção;13/03/2026;${marcador} dois`,
    ].join("\r\n") + "\r\n",
    "utf-8",
  );
}

test.describe("importação de planilhas", () => {
  test("modelo para download: admin baixa; empresa não", async ({ page, browser }) => {
    await entrar(page, E2E.admin.email);
    const xlsx = await page.request.get("/api/importacoes/modelo?formato=xlsx");
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK"); // é um .xlsx (zip) de verdade

    const csvModelo = await page.request.get("/api/importacoes/modelo?formato=csv&dataset=lancamentos");
    expect(csvModelo.status()).toBe(200);
    expect(await csvModelo.text()).toContain("codigo_obra;tipo;data");

    const invalido = await page.request.get("/api/importacoes/modelo?formato=csv");
    expect(invalido.status()).toBe(400);

    const contexto = await browser.newContext();
    const outra = await contexto.newPage();
    await entrar(outra, E2E.empresaUser.email);
    expect((await outra.request.get("/api/importacoes/modelo?formato=xlsx")).status()).toBe(403);
    expect((await outra.goto("/importacoes"))?.status()).toBe(404);
    await contexto.close();
  });

  test("envia CSV, confere a prévia e os erros por linha, confirma, e reimportar não duplica", async ({ page }) => {
    const s = sufixo();
    const marcador = `e2e-import-${s}`;
    await entrar(page, E2E.admin.email);
    await page.goto("/importacoes");

    // Validações do formulário antes de enviar.
    await page.getByRole("button", { name: "Enviar e conferir" }).click();
    await expect(page.getByText("Selecione um arquivo .xlsx ou .csv").first()).toBeVisible();
    await page.setInputFiles("#imp-arquivo", { name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
    await escolher(page, "Empresa", E2E.empresa.nome);
    await page.getByRole("button", { name: "Enviar e conferir" }).click();
    await expect(page.getByText("Use um arquivo .xlsx ou .csv")).toBeVisible();

    // CSV: o formulário pergunta o que o arquivo contém.
    await page.setInputFiles("#imp-arquivo", { name: "marco.csv", mimeType: "text/csv", buffer: csv(marcador) });
    await page.getByRole("button", { name: "Enviar e conferir" }).click();
    await expect(page.getByText("Informe o que o arquivo contém")).toBeVisible();
    await escolher(page, "O que o .csv contém", /Lançamentos/);
    await page.getByRole("button", { name: "Enviar e conferir" }).click();

    // --- Prévia: nada gravado, erros por linha visíveis ---
    await expect(page).toHaveURL(/\/importacoes\/[0-9a-f-]{36}$/, { timeout: 40_000 });
    await expect(page.getByText("Aguardando confirmação").first()).toBeVisible();
    await expect(page.getByText("Nada foi gravado ainda")).toBeVisible();
    await expect(page.getByRole("button", { name: "Importar 2 linha(s) válida(s)" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "31/02/2026" })).toBeVisible();
    await expect(page.getByRole("cell", { name: /Data inválida/ })).toBeVisible();
    await expect(page.getByText(/1\.234,56/).first()).toBeVisible();

    // --- Confirma ---
    await page.getByRole("button", { name: "Importar 2 linha(s) válida(s)" }).click();
    await expect(page.getByText("Importação concluída.").first()).toBeVisible();
    await expect(page.getByText("Concluída com erros")).toBeVisible();
    await expect(page.getByRole("row", { name: /Lançamentos\s+2\s+0\s+0/ })).toBeVisible();

    // --- Os lançamentos aparecem na obra ---
    await page.goto("/obras");
    await page.getByRole("link", { name: E2E.obras.a1.nome }).click();
    await page.getByRole("link", { name: "Lançamentos" }).click();
    await page.getByPlaceholder("Fornecedor, NF, descrição").fill(marcador);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText(/Custos:.*3\.234,56/)).toBeVisible();
    await expect(page.getByText("Planilha").first()).toBeVisible();
    // Importados de planilha não têm botão de editar (são mantidos pela importação).
    await expect(page.getByRole("button", { name: "Editar lançamento" })).toHaveCount(0);

    // --- Reimporta o MESMO arquivo: aviso, e nada duplica ---
    await page.goto("/importacoes");
    await escolher(page, "Empresa", E2E.empresa.nome);
    await page.setInputFiles("#imp-arquivo", { name: "marco-de-novo.csv", mimeType: "text/csv", buffer: csv(marcador) });
    await escolher(page, "O que o .csv contém", /Lançamentos/);
    await page.getByRole("button", { name: "Enviar e conferir" }).click();
    await expect(page).toHaveURL(/\/importacoes\/[0-9a-f-]{36}$/, { timeout: 40_000 });
    await expect(page.getByText("Este arquivo já foi importado")).toBeVisible();
    await page.getByRole("button", { name: "Importar 2 linha(s) válida(s)" }).click();
    await expect(page.getByText("Importação concluída.").first()).toBeVisible();
    await expect(page.getByRole("row", { name: /Lançamentos\s+0\s+0\s+2/ })).toBeVisible(); // 2 sem mudança

    // Segue com 2 lançamentos (3.234,56).
    await page.goto("/obras");
    await page.getByRole("link", { name: E2E.obras.a1.nome }).click();
    await page.getByRole("link", { name: "Lançamentos" }).click();
    await page.getByPlaceholder("Fornecedor, NF, descrição").fill(marcador);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText(/Custos:.*3\.234,56/)).toBeVisible();
    await expect(page.getByText("2 registro(s)")).toBeVisible();
  });

  test("planilha sem nenhuma linha válida: mostra os problemas e não deixa confirmar", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto("/importacoes");
    await escolher(page, "Empresa", E2E.empresa.nome);
    await page.setInputFiles("#imp-arquivo", {
      name: "ruim.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("codigo_obra;tipo;data;categoria\r\nE2E-A1;custo;10/03/2026;Materiais de construção\r\n"),
    });
    await escolher(page, "O que o .csv contém", /Lançamentos/);
    await page.getByRole("button", { name: "Enviar e conferir" }).click();

    await expect(page).toHaveURL(/\/importacoes\/[0-9a-f-]{36}$/, { timeout: 40_000 });
    await expect(page.getByText("Nada foi gravado").first()).toBeVisible();
    await expect(page.getByText('Coluna obrigatória "valor" não encontrada no cabeçalho')).toBeVisible();
    await expect(page.getByRole("button", { name: /Importar/ })).toHaveCount(0);
  });
});
