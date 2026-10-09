import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { expect, type Page, test } from "@playwright/test";
import { entrar } from "./helpers";
import { E2E } from "./users";

const URL_PAINEL = `/dashboard?empresa=${E2E.painel.id}`;

async function baixar(page: Page, nome: "Excel" | "PDF") {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("link", { name: nome }).click(),
  ]);
  const caminho = await download.path();
  expect(caminho, "o navegador não entregou o arquivo").toBeTruthy();
  return { nome: download.suggestedFilename(), bytes: await readFile(caminho!) };
}

async function abrirXlsx(bytes: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return wb;
}

function mapaDaAba(wb: ExcelJS.Workbook, nome: string) {
  const ws = wb.getWorksheet(nome);
  expect(ws, `aba ${nome}`).toBeTruthy();
  const mapa = new Map<string, unknown>();
  ws!.eachRow((r) => mapa.set(String(r.getCell(1).value), r.getCell(2).value));
  return mapa;
}

test.describe("exportação de relatórios", () => {
  test("painel: Excel e PDF trazem os números da tela e ficam na auditoria", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto(URL_PAINEL);
    await expect(page.getByRole("group", { name: "Exportar" })).toBeVisible();

    const xlsx = await baixar(page, "Excel");
    expect(xlsx.nome).toMatch(/^rgo-painel-.*\.xlsx$/);
    expect(xlsx.bytes.subarray(0, 2).toString()).toBe("PK");
    const mapa = mapaDaAba(await abrirXlsx(xlsx.bytes), "Resumo");
    expect(mapa.get("Receita realizada")).toBe(8000);
    expect(mapa.get("Custo realizado")).toBe(2500);
    expect(mapa.get("Empresa")).toBe(E2E.painel.nome);

    const pdf = await baixar(page, "PDF");
    expect(pdf.nome).toMatch(/^rgo-painel-.*\.pdf$/);
    expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");

    await page.goto("/admin/auditoria");
    await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible();
    await page.getByLabel("Buscar por usuário, entidade ou resumo...").fill("Painel exportado em PDF");
    await expect(page.getByRole("cell", { name: /Painel exportado em PDF/ }).first()).toBeVisible();
  });

  test("lançamentos: Excel e PDF da obra, com os totais da lista", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto(URL_PAINEL);
    await page.getByRole("link", { name: new RegExp(E2E.painel.obra.codigo) }).click();
    await page.getByRole("link", { name: "Lançamentos" }).click();
    await expect(page.getByRole("group", { name: "Exportar" })).toBeVisible();

    const xlsx = await baixar(page, "Excel");
    expect(xlsx.nome).toMatch(/^rgo-lancamentos-e2e-p1-.*\.xlsx$/);
    const wb = await abrirXlsx(xlsx.bytes);
    expect(wb.getWorksheet("Lançamentos")!.rowCount).toBe(7); // cabeçalho + 6 lançamentos
    const totais = mapaDaAba(wb, "Filtros e totais");
    expect(totais.get("Custos")).toBe(4200);
    expect(totais.get("Receitas")).toBe(16000);
    expect(totais.get("Obra")).toBe(`${E2E.painel.obra.codigo} — ${E2E.painel.obra.nome}`);

    const pdf = await baixar(page, "PDF");
    expect(pdf.nome).toMatch(/^rgo-lancamentos-e2e-p1-.*\.pdf$/);
    expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.bytes.length).toBeGreaterThan(1000);
  });

  test("empresa pedindo outra empresa no filtro recebe o arquivo vazio, sem os números dela", async ({ page }) => {
    await entrar(page, E2E.empresaUser.email);
    await page.goto(URL_PAINEL);
    await expect(page.getByRole("group", { name: "Exportar" })).toBeVisible();

    const xlsx = await baixar(page, "Excel");
    const wb = await abrirXlsx(xlsx.bytes);
    const mapa = mapaDaAba(wb, "Resumo");
    expect(mapa.get("Receita realizada")).toBe(0);
    expect(mapa.get("Empresa")).toBe("(não disponível)");
    expect(wb.getWorksheet("Obras")!.rowCount).toBe(1);

    const textos: string[] = [];
    wb.eachSheet((ws) => {
      ws.eachRow((r) => {
        r.eachCell((c) => {
          if (typeof c.value === "string") textos.push(c.value);
        });
      });
    });
    const junto = textos.join("\n");
    expect(junto).not.toContain(E2E.painel.nome);
    expect(junto).not.toContain(E2E.painel.obra.codigo);
  });

  test("empresa não exporta lançamentos de obra de outra empresa", async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await entrar(admin, E2E.admin.email);
    await admin.goto("/obras");
    await admin.getByRole("link", { name: E2E.obras.b1.nome }).click();
    const obraId = admin.url().match(/\/obras\/([0-9a-f-]{36})/)?.[1];
    expect(obraId).toBeTruthy();
    await adminCtx.close();

    const empCtx = await browser.newContext();
    const emp = await empCtx.newPage();
    await entrar(emp, E2E.empresaUser.email);
    const resposta = await emp.request.get(`/api/exportacoes/lancamentos?obra=${obraId}&formato=xlsx`);
    expect(resposta.status()).toBe(404);
    await empCtx.close();
  });

  test("sem sessão a exportação responde 401; formato inválido, 400", async ({ page, request }) => {
    expect((await request.get("/api/exportacoes/painel?formato=xlsx")).status()).toBe(401);
    expect((await request.get("/api/exportacoes/lancamentos?formato=pdf")).status()).toBe(401);

    await entrar(page, E2E.admin.email);
    const ruim = await page.request.get("/api/exportacoes/painel?formato=csv");
    expect(ruim.status()).toBe(400);
  });
});
