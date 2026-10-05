import { describe, expect, it } from "vitest";
import { ErroCredenciais, ErroHttp, ErroRede, calcularBackoff, lerRetryAfter, requisitar } from "./http";
import { LimitadorTaxa, type RelogioLimitador } from "./rate-limit";

const resposta = (status: number, corpo = "", headers: Record<string, string> = {}) => new Response(corpo, { status, headers });

/** fetch falso que devolve as respostas (ou erros) na ordem. */
function fetchSequencia(...itens: (Response | Error)[]) {
  const chamadas: string[] = [];
  const impl = (async (url: string) => {
    chamadas.push(url);
    const item = itens.shift();
    if (!item) throw new Error("fetch chamado além do previsto");
    if (item instanceof Error) throw item;
    return item;
  }) as unknown as typeof fetch;
  return { impl, chamadas };
}

function ambiente(capacidade = 1000) {
  let t = 0;
  const relogio: RelogioLimitador = { agora: () => t, dormir: async (ms) => void (t += ms) };
  const esperas: number[] = [];
  return {
    limitador: new LimitadorTaxa(capacidade, 60_000, relogio),
    dormir: async (ms: number) => void esperas.push(ms),
    esperas,
    aleatorio: () => 0.5,
  };
}

describe("requisitar", () => {
  it("devolve a resposta de sucesso sem repetir", async () => {
    const a = ambiente();
    const f = fetchSequencia(resposta(200, '{"ok":true}'));
    const r = await requisitar("https://x/y", {}, a.limitador, { fetchImpl: f.impl, dormir: a.dormir });
    expect(await r.json()).toEqual({ ok: true });
    expect(f.chamadas).toHaveLength(1);
  });

  it("repete em 500/503 com backoff exponencial e acaba tendo sucesso", async () => {
    const a = ambiente();
    const f = fetchSequencia(resposta(500), resposta(503), resposta(200, "ok"));
    const r = await requisitar("https://x", {}, a.limitador, { fetchImpl: f.impl, dormir: a.dormir, aleatorio: a.aleatorio, baseBackoffMs: 1000 });
    expect(await r.text()).toBe("ok");
    expect(f.chamadas).toHaveLength(3);
    // jitter 0.5 → metade do teto: 1000/2, 2000/2
    expect(a.esperas).toEqual([500, 1000]);
  });

  it("respeita Retry-After no 503", async () => {
    const a = ambiente();
    const f = fetchSequencia(resposta(503, "", { "retry-after": "7" }), resposta(200, "ok"));
    await requisitar("https://x", {}, a.limitador, { fetchImpl: f.impl, dormir: a.dormir });
    expect(a.esperas).toEqual([7000]);
  });

  it("429 pausa o limitador inteiro pelo tempo pedido e repete", async () => {
    let t = 0;
    const relogio: RelogioLimitador = { agora: () => t, dormir: async (ms) => void (t += ms) };
    const limitador = new LimitadorTaxa(100, 6000, relogio);
    const f = fetchSequencia(resposta(429, "", { "retry-after": "30" }), resposta(200, "ok"));
    await requisitar("https://x", {}, limitador, { fetchImpl: f.impl });
    expect(t).toBeGreaterThanOrEqual(30_000); // o limitador esperou os 30 s
    expect(f.chamadas).toHaveLength(2);
  });

  it("repete em falha de rede e esgota as tentativas com ErroRede", async () => {
    const a = ambiente();
    const f = fetchSequencia(new TypeError("fetch failed"), new TypeError("fetch failed"), new TypeError("fetch failed"));
    await expect(
      requisitar("https://x", {}, a.limitador, { fetchImpl: f.impl, dormir: a.dormir, maxTentativas: 3 }),
    ).rejects.toBeInstanceOf(ErroRede);
    expect(f.chamadas).toHaveLength(3);
    expect(a.esperas).toHaveLength(2); // dorme entre as tentativas, não depois da última
  });

  it("401/403 viram ErroCredenciais, sem repetir", async () => {
    for (const status of [401, 403]) {
      const a = ambiente();
      const f = fetchSequencia(resposta(status, "negado"));
      const erro = await requisitar("https://x", {}, a.limitador, { fetchImpl: f.impl, dormir: a.dormir }).catch((e) => e);
      expect(erro).toBeInstanceOf(ErroCredenciais);
      expect(erro.status).toBe(status);
      expect(f.chamadas).toHaveLength(1);
    }
  });

  it("outros 4xx (400, 404, 422) falham na hora, sem repetir", async () => {
    for (const status of [400, 404, 422]) {
      const a = ambiente();
      const f = fetchSequencia(resposta(status, '{"clientMessage":"ruim"}'));
      const erro = await requisitar("https://x", {}, a.limitador, { fetchImpl: f.impl, dormir: a.dormir }).catch((e) => e);
      expect(erro).toBeInstanceOf(ErroHttp);
      expect(erro.status).toBe(status);
      expect(erro.corpo).toContain("ruim");
      expect(f.chamadas).toHaveLength(1);
    }
  });

  it("após esgotar as tentativas em 500, devolve o ErroHttp da última", async () => {
    const a = ambiente();
    const f = fetchSequencia(resposta(500, "a"), resposta(500, "b"));
    const erro = await requisitar("https://x", {}, a.limitador, { fetchImpl: f.impl, dormir: a.dormir, maxTentativas: 2 }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro.status).toBe(500);
    expect(erro.corpo).toBe("b");
  });

  it("cada tentativa consome uma ficha do limitador", async () => {
    const a = ambiente();
    let fichas = 0;
    const original = a.limitador.adquirir.bind(a.limitador);
    a.limitador.adquirir = () => (fichas++, original());
    const f = fetchSequencia(resposta(500), resposta(500), resposta(200));
    await requisitar("https://x", {}, a.limitador, { fetchImpl: f.impl, dormir: a.dormir });
    expect(fichas).toBe(3);
  });
});

describe("calcularBackoff / lerRetryAfter", () => {
  it("cresce exponencialmente até o teto, com jitter", () => {
    expect(calcularBackoff(1, 1000, 60_000, () => 1)).toBe(1000);
    expect(calcularBackoff(2, 1000, 60_000, () => 1)).toBe(2000);
    expect(calcularBackoff(3, 1000, 60_000, () => 1)).toBe(4000);
    expect(calcularBackoff(10, 1000, 60_000, () => 1)).toBe(60_000);
    expect(calcularBackoff(3, 1000, 60_000, () => 0)).toBe(0);
    expect(calcularBackoff(3, 1000, 60_000, () => 0.25)).toBe(1000);
  });

  it("lê segundos e data HTTP", () => {
    expect(lerRetryAfter("12")).toBe(12_000);
    expect(lerRetryAfter("0")).toBe(0);
    expect(lerRetryAfter(null)).toBeNull();
    expect(lerRetryAfter("lixo")).toBeNull();
    const agora = Date.parse("2026-10-04T12:00:00Z");
    expect(lerRetryAfter("Sun, 04 Oct 2026 12:00:30 GMT", agora)).toBe(30_000);
    expect(lerRetryAfter("Sun, 04 Oct 2026 11:00:00 GMT", agora)).toBe(0);
  });
});
