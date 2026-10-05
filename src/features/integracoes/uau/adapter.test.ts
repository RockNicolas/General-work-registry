import { describe, expect, it } from "vitest";
import { ErpNaoImplementado } from "../erp/tipos";
import { criarAdapter } from "../erp/registro";
import { lerConfig } from "../config";
import { LumiaAdapter } from "../lumia/adapter";
import { UauAdapter, validarEndereco } from "./adapter";

const coletar = async (it: AsyncIterable<unknown>) => {
  for await (const _ of it) void _;
};

describe("UauAdapter (esqueleto)", () => {
  const uau = (endereco = "https://uau.exemplo.com.br") => new UauAdapter({ endereco, usuario: "tecnico", senha: "x" });

  it("valida a configuração, mas diz que a conexão aguarda a documentação", async () => {
    const r = await uau().testarConexao();
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("aguarda a documentação") });
  });

  it("recusa endereços inseguros ou inválidos", async () => {
    for (const ruim of ["http://uau.exemplo.com.br", "uau.exemplo.com.br", "https://user:senha@uau.exemplo.com.br", "https://localhost", "https://127.0.0.1:8080", "https://10.0.0.5", "https://192.168.1.10", "https://172.20.1.1", "https://169.254.169.254/latest"]) {
      const r = await uau(ruim).testarConexao();
      expect(r.ok, ruim).toBe(false);
      expect(() => validarEndereco(ruim), ruim).toThrow();
    }
    expect(validarEndereco("https://uau.exemplo.com.br/api").hostname).toBe("uau.exemplo.com.br");
  });

  it("exige usuário e senha", async () => {
    const r = await new UauAdapter({ endereco: "https://uau.exemplo.com.br", usuario: "", senha: "" }).testarConexao();
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("obrigatórios") });
  });

  it("as demais operações falham com 'não implementado'", async () => {
    await expect(uau().listarObras()).rejects.toBeInstanceOf(ErpNaoImplementado);
    await expect(uau().listarOrcamento()).rejects.toBeInstanceOf(ErpNaoImplementado);
    await expect(coletar(uau().listarCustos())).rejects.toBeInstanceOf(ErpNaoImplementado);
    await expect(coletar(uau().listarReceitas())).rejects.toThrow(/aguardando a documentação/i);
  });
});

describe("LumiaAdapter (stub)", () => {
  it("existe, mas nada está implementado", async () => {
    const l = new LumiaAdapter();
    expect(await l.testarConexao()).toEqual({ ok: false, erro: expect.stringContaining("ainda não foi implementada") });
    await expect(l.listarObras()).rejects.toBeInstanceOf(ErpNaoImplementado);
    await expect(coletar(l.listarCustos())).rejects.toBeInstanceOf(ErpNaoImplementado);
  });
});

describe("criarAdapter", () => {
  const base = { endereco: "demo", credenciais: { usuario: "u", senha: "s" }, config: lerConfig({ indexadorCorrecaoId: 1 }) };

  it("escolhe o adaptador pelo ERP", () => {
    expect(criarAdapter({ ...base, erp: "sienge" }).erp).toBe("sienge");
    expect(criarAdapter({ ...base, erp: "uau" }).erp).toBe("uau");
    expect(criarAdapter({ ...base, erp: "lumia" }).erp).toBe("lumia");
  });
});
