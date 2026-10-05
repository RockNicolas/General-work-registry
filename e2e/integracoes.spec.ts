import { expect, test } from "@playwright/test";
import { entrar, escolher, sufixo } from "./helpers";
import { E2E } from "./users";

const { integracao } = E2E;

test.describe("integrações com ERP: cadastro", () => {
  test("administrador cadastra, edita e exclui uma integração; empresa não vê o menu", async ({ page, browser }) => {
    const s = sufixo();
    const nome = `E2E Sienge ${s}`;
    await entrar(page, E2E.admin.email);
    await expect(page.getByRole("link", { name: "Integrações" })).toBeVisible();
    await page.goto("/admin/integracoes");

    // Validações antes de enviar.
    await page.getByRole("button", { name: "Nova integração" }).click();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Escolha a empresa")).toBeVisible();
    await expect(page.getByText("Informe um nome")).toBeVisible();
    await expect(page.getByText("Informe o usuário da API")).toBeVisible();
    await expect(page.getByText("Informe a senha da API")).toBeVisible();

    // Em produção o Sienge só aceita o subdomínio (anti-SSRF): uma URL é recusada na tela.
    await escolher(page, "Empresa", E2E.empresa.nome);
    await page.getByLabel("Nome da integração").fill(nome);
    await page.getByLabel("Subdomínio do Sienge").fill("https://exemplo.sienge.com.br");
    await page.getByLabel("Usuário da API").fill("api-usuario");
    await page.getByLabel("Senha da API", { exact: true }).fill("api-senha-secreta");
    await page.getByLabel("Código do indexador de correção").fill("1");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(/Informe apenas o subdomínio do Sienge/)).toBeVisible();

    await page.getByLabel("Subdomínio do Sienge").fill(`e2e-${s}`);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Integração criada. Teste a conexão para ativá-la.")).toBeVisible();

    // Entra na lista como "Pausada" (só vira ativa depois de um teste de conexão bem-sucedido).
    const linha = page.getByRole("row", { name: new RegExp(nome) });
    await expect(linha).toBeVisible();
    await expect(linha.getByText("Pausada")).toBeVisible();
    await page.getByRole("link", { name: nome }).first().click();
    await expect(page.getByRole("heading", { name: nome })).toBeVisible();
    await expect(page.getByText("Integração pausada")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sincronizar agora" })).toBeDisabled(); // pausada e sem obras vinculadas

    // A senha nunca volta do servidor: a tela só mostra o usuário mascarado.
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await expect(page.getByText(/Atual: ap•+\. Deixe em branco para manter\./)).toBeVisible();
    await expect(page.getByLabel("Senha da API", { exact: true })).toHaveValue("");
    await page.getByLabel("Nome da integração").fill(`${nome} editada`);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Integração atualizada.")).toBeVisible();
    await expect(page.getByRole("heading", { name: `${nome} editada` })).toBeVisible();

    // Quem não é administrador não tem o menu.
    const contexto = await browser.newContext();
    const outra = await contexto.newPage();
    await entrar(outra, E2E.empresaUser.email);
    await expect(outra.getByRole("link", { name: "Integrações" })).toHaveCount(0);
    await contexto.close();

    // Exclui (ainda não gravou lançamentos).
    await page.getByRole("button", { name: `Excluir ${nome} editada` }).click();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/integracoes$/);
    await expect(page.getByRole("link", { name: `${nome} editada` })).toHaveCount(0);
  });
});

// Estes testes compartilham a integração criada pelo global-setup (apontando para o Sienge falso),
// então rodam em sequência e cada passo parte do que o anterior deixou.
test.describe.serial("integrações com ERP: operação (contra o Sienge falso)", () => {
  test("testar conexão ativa a integração; só então dá para sincronizar, e antes é preciso vincular obras", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto("/admin/integracoes");
    const linha = page.getByRole("row", { name: new RegExp(integracao.nome) });
    await expect(linha.getByText("Pausada")).toBeVisible();
    await linha.getByRole("link", { name: integracao.nome }).click();
    await expect(page.getByRole("heading", { name: integracao.nome })).toBeVisible();
    await expect(page.getByText("Integração pausada")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sincronizar agora" })).toBeDisabled();

    await page.getByRole("button", { name: "Testar conexão" }).click();
    await expect(page.getByText("Conectado ao Sienge. 2 empreendimento(s) disponível(is) para integração.")).toBeVisible();
    await expect(page.getByText("Integração pausada")).toHaveCount(0);
    await expect(page.getByText("Ativa", { exact: true }).first()).toBeVisible();
    // Ativa, mas ainda sem obras vinculadas: nada a sincronizar.
    await expect(page.getByRole("button", { name: "Sincronizar agora" })).toBeDisabled();
  });

  test("vincula a obra do ERP a uma obra do RGO", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto(`/admin/integracoes/${integracao.id}`);
    await expect(page.getByText("Nenhuma obra vinculada ainda.")).toBeVisible();

    await page.getByRole("button", { name: "Buscar obras no ERP" }).click();
    await expect(page.getByText(integracao.obraErp.nome)).toBeVisible();
    await expect(page.getByText("Empreendimento E2E Cento e Dois")).toBeVisible();
    await expect(page.getByRole("button", { name: /Criar 2 obra\(s\) no RGO/ })).toBeVisible();

    await page.locator(`#vinculo-${integracao.obraErp.id}`).click();
    // Só as obras DA EMPRESA da integração são oferecidas (a da outra empresa não).
    await expect(page.getByRole("option", { name: new RegExp(E2E.obras.b1.codigo) })).toHaveCount(0);
    await page.getByRole("option", { name: new RegExp(E2E.obras.a1.codigo) }).click();
    await expect(page.getByRole("button", { name: /Criar 1 obra\(s\) no RGO/ })).toBeVisible();

    await page.getByRole("button", { name: "Salvar vínculos" }).click();
    await expect(page.getByText("Vínculos salvos.")).toBeVisible();
    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(page.getByRole("list", { name: "Vínculos atuais" })).toContainText(`${E2E.obras.a1.codigo} — ${E2E.obras.a1.nome}`);
    await expect(page.getByRole("button", { name: "Sincronizar agora" })).toBeEnabled();
  });

  test("sincronizar agora enfileira uma execução e não aceita outra enquanto houver uma na fila", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto(`/admin/integracoes/${integracao.id}`);

    await page.getByRole("button", { name: "Sincronizar agora" }).click();
    await expect(page.getByText("Sincronização enfileirada.")).toBeVisible();
    await expect(page.getByText("Na fila").first()).toBeVisible();

    await page.getByRole("button", { name: "Sincronizar agora" }).click();
    await expect(page.getByText(/Já existe uma sincronização desta integração na fila ou em andamento/)).toBeVisible();
  });

  test("o histórico mostra as execuções com contadores e o log", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto(`/admin/integracoes/${integracao.id}`);

    const antiga = page.locator("details", { hasText: "Concluída com problemas" });
    await expect(antiga).toBeVisible();
    await expect(antiga).toContainText("Agendada");
    await expect(antiga).toContainText("12 lidos · 9 gravados · 2 iguais · 1 problema(s)");
    await expect(antiga).toContainText("1min 15s");
    await antiga.locator("summary").click();
    await expect(antiga.getByText("Parcela 77 sem rateio por obra: ignorada (e2e)")).toBeVisible();
  });

  test("webhook: o segredo aparece uma vez, autentica o ERP, e gerar outro invalida o anterior", async ({ page }) => {
    await entrar(page, E2E.admin.email);
    await page.goto(`/admin/integracoes/${integracao.id}`);
    await expect(page.getByText("Inativo")).toBeVisible();

    const url = await page.locator("#webhook-url").inputValue();
    expect(url).toMatch(new RegExp(`/api/webhooks/sienge/${integracao.id}$`));
    const caminho = `/api/webhooks/sienge/${integracao.id}`;

    await page.getByRole("button", { name: "Gerar segredo" }).click();
    await expect(page.getByText("Copie o segredo agora")).toBeVisible();
    const primeiro = await page.getByLabel("Segredo do webhook").inputValue();
    expect(primeiro.length).toBeGreaterThanOrEqual(32);
    await expect(page.getByText("Ativo", { exact: true })).toBeVisible();

    // Sem segredo ou com segredo errado: 401 igual. Com o certo: aceito.
    expect((await page.request.post(caminho, { data: {} })).status()).toBe(401);
    expect((await page.request.post(caminho, { data: {}, headers: { Authorization: "Bearer errado" } })).status()).toBe(401);
    const aceito = await page.request.post(caminho, { data: { evento: "e2e" }, headers: { Authorization: `Bearer ${primeiro}` } });
    expect(aceito.status()).toBe(202);

    // Novo segredo: o antigo deixa de valer.
    await page.getByRole("button", { name: "Gerar novo segredo" }).click();
    await expect(page.getByLabel("Segredo do webhook")).not.toHaveValue(primeiro);
    const segundo = await page.getByLabel("Segredo do webhook").inputValue();
    expect((await page.request.post(caminho, { data: {}, headers: { Authorization: `Bearer ${primeiro}` } })).status()).toBe(401);
    expect((await page.request.post(caminho, { data: {}, headers: { Authorization: `Bearer ${segundo}` } })).status()).toBe(202);

    // Desativar: nenhum segredo vale mais.
    await page.getByRole("button", { name: "Desativar" }).click();
    await page.getByRole("button", { name: "Desativar", exact: true }).last().click();
    await expect(page.getByText("Webhook desativado.")).toBeVisible();
    await expect(page.getByText("Inativo")).toBeVisible();
    expect((await page.request.post(caminho, { data: {}, headers: { Authorization: `Bearer ${segundo}` } })).status()).toBe(401);
  });
});
