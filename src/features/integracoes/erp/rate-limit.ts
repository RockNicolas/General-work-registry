/**
 * Limitador de taxa por "balde de fichas" (token bucket). Cada chamada ao ERP consome uma ficha;
 * as fichas voltam a uma taxa constante. Quem chega sem ficha espera, em ordem de chegada.
 *
 * Vale por PROCESSO: o worker roda numa instância só (concurrency controlada pela fila), então o
 * limite combinado de todas as sincronizações do mesmo ERP/subdomínio é respeitado.
 */
export type RelogioLimitador = {
  agora: () => number;
  dormir: (ms: number) => Promise<void>;
};

const relogioReal: RelogioLimitador = {
  agora: () => Date.now(),
  dormir: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class LimitadorTaxa {
  private fichas: number;
  private ultimoReabastecimento: number;
  private pausadoAte = 0;
  /** Fila FIFO: cada chamada espera a anterior terminar de adquirir a sua ficha. */
  private fila: Promise<void> = Promise.resolve();

  /**
   * @param capacidade fichas guardadas no máximo (tamanho da "rajada" permitida)
   * @param porMinuto  fichas devolvidas por minuto
   */
  constructor(
    readonly capacidade: number,
    readonly porMinuto: number,
    private readonly relogio: RelogioLimitador = relogioReal,
  ) {
    if (capacidade < 1 || porMinuto <= 0) throw new RangeError("Limitador inválido");
    this.fichas = capacidade;
    this.ultimoReabastecimento = relogio.agora();
  }

  private reabastecer() {
    const agora = this.relogio.agora();
    const decorrido = Math.max(0, agora - this.ultimoReabastecimento);
    this.fichas = Math.min(this.capacidade, this.fichas + (decorrido / 60_000) * this.porMinuto);
    this.ultimoReabastecimento = agora;
  }

  /** Espera até haver uma ficha e a consome. */
  adquirir(): Promise<void> {
    const vez = this.fila.then(async () => {
      for (;;) {
        const agora = this.relogio.agora();
        if (agora < this.pausadoAte) {
          await this.relogio.dormir(this.pausadoAte - agora);
          continue;
        }
        this.reabastecer();
        if (this.fichas >= 1) {
          this.fichas -= 1;
          return;
        }
        const faltam = 1 - this.fichas;
        await this.relogio.dormir(Math.ceil((faltam / this.porMinuto) * 60_000));
      }
    });
    // A fila segue mesmo se alguém desistir/falhar.
    this.fila = vez.catch(() => undefined);
    return vez;
  }

  /** Depois de um 429: ninguém passa até `ms` à frente, e o balde esvazia. */
  pausar(ms: number): void {
    this.pausadoAte = Math.max(this.pausadoAte, this.relogio.agora() + ms);
    this.fichas = 0;
    this.ultimoReabastecimento = this.pausadoAte;
  }
}
