/**
 * Períodos dos dashboards. Meses trafegam como "YYYY-MM" e datas como "YYYY-MM-DD", sempre texto:
 * nada passa por Date/fuso para não deslocar o dia (ver src/lib/dates.ts).
 */
export type Mes = string;

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const mesValido = (texto: string): boolean => MES.test(texto);

const dois = (n: number) => String(n).padStart(2, "0");

/** "2026-01" + 13 → "2027-02"; aceita n negativo. */
export function adicionarMeses(mes: Mes, n: number): Mes {
  const m = MES.exec(mes);
  if (!m) throw new RangeError(`Mês inválido: ${mes}`);
  const indice = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
  return `${String(Math.floor(indice / 12)).padStart(4, "0")}-${dois((indice % 12) + 1)}`;
}

/** Todos os meses de `de` até `ate`, inclusive. Vazio se `de` for posterior a `ate`. */
export function mesesEntre(de: Mes, ate: Mes): Mes[] {
  const lista: Mes[] = [];
  for (let m = de; m <= ate; m = adicionarMeses(m, 1)) lista.push(m);
  return lista;
}

export const primeiroDiaDoMes = (mes: Mes): string => `${mes}-01`;

export function ultimoDiaDoMes(mes: Mes): string {
  const m = MES.exec(mes);
  if (!m) throw new RangeError(`Mês inválido: ${mes}`);
  return `${mes}-${dois(new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate())}`;
}

/** "2026-03-15" → "2026-03". */
export const mesDe = (data: string): Mes => data.slice(0, 7);

/** A data de hoje no fuso de Brasília ("YYYY-MM-DD"): é o "hoje" do negócio, não o do servidor. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** "2026-03" → "mar/2026". */
const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function rotuloMes(mes: Mes): string {
  const m = MES.exec(mes);
  return m ? `${NOMES[Number(m[2]) - 1]}/${m[1]}` : mes;
}

/** "2026-03-30" + 3 → "2026-04-02"; aceita n negativo. */
export function somarDias(data: string, n: number): string {
  const [y, m, d] = data.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Diferença em dias inteiros entre duas datas ISO (b − a). */
export function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number) as [number, number, number];
  const [yb, mb, db] = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}
