/**
 * CNPJ numérico e alfanumérico (formato válido a partir de julho/2026): 12 caracteres [0-9A-Z]
 * seguidos de 2 dígitos verificadores numéricos. Cada caractere vale (código ASCII − 48).
 */
const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function limparCnpj(texto: string): string {
  return texto.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function digito(caracteres: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) {
    soma += (caracteres.charCodeAt(i) - 48) * pesos[i]!;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(texto: string): boolean {
  const c = limparCnpj(texto);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
  if (/^(.)\1{13}$/.test(c)) return false; // 00000000000000, 11111111111111...

  const dv1 = digito(c.slice(0, 12), PESOS_DV1);
  const dv2 = digito(c.slice(0, 12) + dv1, PESOS_DV2);
  return c.endsWith(`${dv1}${dv2}`);
}

/** "11222333000181" → "11.222.333/0001-81". Devolve o texto limpo se não tiver 14 caracteres. */
export function formatarCnpj(texto: string): string {
  const c = limparCnpj(texto);
  if (c.length !== 14) return c;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
