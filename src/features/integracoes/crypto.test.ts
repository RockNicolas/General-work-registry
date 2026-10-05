import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { criptografar, descriptografar, gerarSegredoWebhook, hashSegredo, segredoConfere } from "./crypto";

const CHAVE = Buffer.alloc(32, 9).toString("base64");
let original: string | undefined;

beforeEach(() => {
  original = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = CHAVE;
});
afterEach(() => {
  if (original === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = original;
});

describe("criptografar / descriptografar", () => {
  it("faz ida e volta, inclusive com acentos e JSON", () => {
    const segredo = JSON.stringify({ usuario: "api-integração", senha: "Pä$$w0rd ✓" });
    const { valor, versao } = criptografar(segredo, "integracao:abc");
    expect(versao).toBe(1);
    expect(valor).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]*$/);
    expect(valor).not.toContain("Pä$$w0rd");
    expect(descriptografar(valor, "integracao:abc")).toBe(segredo);
  });

  it("cada criptografia gera um valor diferente (IV aleatório)", () => {
    expect(criptografar("x", "a").valor).not.toBe(criptografar("x", "a").valor);
  });

  it("não abre em outro registro (AAD) nem adulterado", () => {
    const { valor } = criptografar("segredo", "integracao:1");
    expect(() => descriptografar(valor, "integracao:2")).toThrow(/Não foi possível descriptografar/);

    const adulterado = valor.slice(0, -2) + (valor.endsWith("AA") ? "BB" : "AA");
    expect(() => descriptografar(adulterado, "integracao:1")).toThrow(/Não foi possível descriptografar/);
  });

  it("não abre com outra chave", () => {
    const { valor } = criptografar("segredo", "x");
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    expect(() => descriptografar(valor, "x")).toThrow(/Não foi possível descriptografar/);
  });

  it("avisa claramente quando a chave não está configurada ou é inválida", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => criptografar("x", "a")).toThrow(/ENCRYPTION_KEY não configurada/);
    process.env.ENCRYPTION_KEY = "curta";
    expect(() => criptografar("x", "a")).toThrow(/32 bytes/);
  });

  it("recusa formato desconhecido", () => {
    expect(() => descriptografar("lixo", "x")).toThrow(/formato desconhecido/);
  });
});

describe("segredo do webhook", () => {
  it("gera segredos longos e únicos; só o hash é comparável", () => {
    const a = gerarSegredoWebhook();
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(gerarSegredoWebhook()).not.toBe(a);
    expect(segredoConfere(a, hashSegredo(a))).toBe(true);
    expect(segredoConfere(`${a}x`, hashSegredo(a))).toBe(false);
    expect(segredoConfere(a, null)).toBe(false);
  });
});
