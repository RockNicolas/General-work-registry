import { expect, type Page } from "@playwright/test";
import { E2E } from "./users";

export async function entrar(page: Page, email: string, senha: string = E2E.senha) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  // O primeiro login depois de subir o `next dev` paga a compilação das rotas: folga generosa.
  await expect(page).toHaveURL(/\/(?:dashboard\b|a(?:$|\?)|e\/)/, { timeout: 40_000 });
}

/** Escolhe uma opção num Select do shadcn (Radix): abre o combobox pelo rótulo e clica na opção. */
export async function escolher(page: Page, rotulo: string, opcao: string | RegExp) {
  await page.getByRole("combobox", { name: rotulo }).click();
  await page.getByRole("option", { name: opcao }).click();
}

/** Sufixo curto e único por execução, para criar registros sem colidir com execuções anteriores. */
export const sufixo = () => Date.now().toString(36).slice(-6);
