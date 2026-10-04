/** Percentuais trafegam em pontos-base (inteiro): 10000 = 100%, 1250 = 12,50%. */
export type Bps = number;

const pct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1250 → "12,50%". */
export function formatBps(bps: Bps): string {
  if (!Number.isSafeInteger(bps)) throw new RangeError(`Bps deve ser inteiro, recebido: ${bps}`);
  return `${pct.format(bps / 100)}%`;
}

/** 1250 → "12,5" (sem símbolo, para campos de entrada). */
export function formatBpsInput(bps: Bps): string {
  const texto = pct.format(bps / 100);
  return texto.replace(/,00$/, "").replace(/(,\d)0$/, "$1");
}

const PADRAO = /^(\d{1,3})(?:,(\d{1,2}))?$/;

/** Lê "12,5", "12,50%", "100" → pontos-base. null se inválido ou acima de 100%. */
export function parsePercentBps(texto: string): Bps | null {
  const limpo = texto.replace(/%/g, "").replace(/[\s ]/g, "");
  const m = PADRAO.exec(limpo);
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bps >= 0 && bps <= 10_000 ? bps : null;
}
