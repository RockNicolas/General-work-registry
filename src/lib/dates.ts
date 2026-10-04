/**
 * Datas de negócio (competência, vencimento, pagamento) são "date" puro: trafegam como
 * "YYYY-MM-DD" e nunca passam por Date/fuso, para não deslocar o dia.
 * Instantes (criado_em, auditoria) são Date e exibidos em America/Sao_Paulo.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** true se for uma data ISO ("YYYY-MM-DD") que existe no calendário. */
export function dataIsoValida(texto: string): boolean {
  const match = ISO_DATE.exec(texto);
  return !!match && isRealDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** "2026-10-04" → "04/10/2026". Retorna null se a entrada não for uma data ISO válida. */
export function formatDateBR(isoDate: string): string | null {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return null;
  const [, y, m, d] = match;
  if (!isRealDate(Number(y), Number(m), Number(d))) return null;
  return `${d}/${m}/${y}`;
}

/** "04/10/2026" → "2026-10-04". Retorna null se não for uma data real. */
export function parseDateBR(text: string): string | null {
  const match = BR_DATE.exec(text.trim());
  if (!match) return null;
  const [, d, m, y] = match;
  if (!isRealDate(Number(y), Number(m), Number(d))) return null;
  return `${y}-${m}-${d}`;
}

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function formatDateTimeBR(instant: Date): string {
  return dateTime.format(instant).replace(",", "");
}

/** "2026-10-01" → "out/2026" (competência mensal). */
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function formatCompetenciaBR(isoDate: string): string | null {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return null;
  return `${MESES[Number(match[2]) - 1]}/${match[1]}`;
}
