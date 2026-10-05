import { describe, expect, it } from "vitest";
import { LimitadorTaxa, type RelogioLimitador } from "./rate-limit";

/** Relógio falso: "dormir" só avança o tempo, sem esperar de verdade. */
function relogioFalso() {
  let t = 1_000_000;
  const esperas: number[] = [];
  const relogio: RelogioLimitador = {
    agora: () => t,
    dormir: async (ms) => {
      esperas.push(ms);
      t += ms;
    },
  };
  return { relogio, esperas, avancar: (ms: number) => (t += ms), agora: () => t };
}

describe("LimitadorTaxa", () => {
  it("deixa passar a rajada inicial sem esperar", async () => {
    const r = relogioFalso();
    const l = new LimitadorTaxa(5, 60, r.relogio);
    for (let i = 0; i < 5; i++) await l.adquirir();
    expect(r.esperas).toEqual([]);
  });

  it("depois da rajada, espera o tempo de uma ficha (60/min = 1 por segundo)", async () => {
    const r = relogioFalso();
    const l = new LimitadorTaxa(2, 60, r.relogio);
    await l.adquirir();
    await l.adquirir();
    await l.adquirir();
    expect(r.esperas).toEqual([1000]);
  });

  it("respeita o ritmo sustentado: 20/min => ~3 s entre chamadas", async () => {
    const r = relogioFalso();
    const l = new LimitadorTaxa(1, 20, r.relogio);
    const inicio = r.agora();
    for (let i = 0; i < 11; i++) await l.adquirir();
    // 1 imediata + 10 esperas de 3 s
    expect(r.agora() - inicio).toBe(10 * 3000);
  });

  it("repõe fichas com o passar do tempo, até a capacidade", async () => {
    const r = relogioFalso();
    const l = new LimitadorTaxa(3, 60, r.relogio);
    for (let i = 0; i < 3; i++) await l.adquirir();
    r.avancar(10_000); // mais que o necessário para encher
    for (let i = 0; i < 3; i++) await l.adquirir();
    expect(r.esperas).toEqual([]); // não passou de 3 fichas guardadas, mas tinha as 3
    await l.adquirir();
    expect(r.esperas).toEqual([1000]);
  });

  it("atende em ordem de chegada (FIFO)", async () => {
    const r = relogioFalso();
    const l = new LimitadorTaxa(1, 60, r.relogio);
    const ordem: number[] = [];
    await Promise.all([1, 2, 3, 4].map((n) => l.adquirir().then(() => ordem.push(n))));
    expect(ordem).toEqual([1, 2, 3, 4]);
  });

  it("pausar (ex.: depois de um 429) segura todos até o fim da pausa", async () => {
    const r = relogioFalso();
    const l = new LimitadorTaxa(10, 600, r.relogio);
    l.pausar(5000);
    const antes = r.agora();
    await l.adquirir();
    expect(r.agora() - antes).toBeGreaterThanOrEqual(5000);
  });

  it("rejeita configuração inválida", () => {
    expect(() => new LimitadorTaxa(0, 10)).toThrow(RangeError);
    expect(() => new LimitadorTaxa(1, 0)).toThrow(RangeError);
  });
});
