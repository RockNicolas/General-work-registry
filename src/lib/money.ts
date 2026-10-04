/**
 * Valores monetários trafegam sempre como centavos (inteiro seguro), nunca float.
 * Conversão para texto só na borda: formatBRL para exibir, parseBRL para ler.
 */
export type Centavos = number;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(centavos: Centavos): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new RangeError(`Centavos deve ser um inteiro seguro, recebido: ${centavos}`);
  }
  return brl.format(centavos / 100);
}

const BRL_PATTERN = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/**
 * Lê texto no formato pt-BR ("R$ 1.234,56", "1234,5", "-10"). O ponto só vale como
 * separador de milhar. Retorna null se o texto não for um valor válido.
 */
export function parseBRL(text: string): Centavos | null {
  const cleaned = text.replace(/R\$/gi, "").replace(/[\s ]/g, "");
  const match = BRL_PATTERN.exec(cleaned);
  if (!match) return null;

  const [, sign, integerPart, fraction = ""] = match;
  const reais = Number((integerPart ?? "").replaceAll(".", ""));
  const centavos = reais * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos)) return null;
  return sign === "-" ? -centavos : centavos;
}
