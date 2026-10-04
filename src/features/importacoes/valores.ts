import { dataIsoValida } from "@/lib/dates";
import { parseBRL } from "@/lib/money";
import { normalizarChave } from "./modelo";

/**
 * Conversão de células de planilha (texto, número, data do Excel...) em valores tipados.
 * Cada função devolve { ok, valor } ou { ok:false, erro } com mensagem em português.
 * Célula vazia é sempre ok com valor null (obrigatoriedade é decidida pelo schema).
 */
export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
const erro = (mensagem: string): Resultado<never> => ({ ok: false, erro: mensagem });

export function ehVazio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** Texto da célula como o usuário vê (para mostrar o valor problemático nos erros). */
export function textoDe(v: unknown): string {
  if (ehVazio(v)) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

const ANO_MIN = 1990;
const ANO_MAX = 2100;

function isoDe(ano: number, mes: number, dia: number): string | null {
  if (ano < ANO_MIN || ano > ANO_MAX) return null;
  const iso = `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return dataIsoValida(iso) ? iso : null;
}

/** Número de série do Excel (dias desde 30/12/1899) → ISO. */
function dataDeSerial(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 2_958_465) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000);
  return isoDe(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

const MSG_DATA = "Data inválida: use dd/mm/aaaa (ex.: 31/03/2026)";

/** Aceita dd/mm/aaaa, d/m/aaaa, dd-mm-aaaa, dd.mm.aaaa, aaaa-mm-dd, serial do Excel e Date. */
export function parseData(v: unknown): Resultado<string | null> {
  if (ehVazio(v)) return ok(null);
  if (v instanceof Date) {
    const iso = isoDe(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
    return iso ? ok(iso) : erro(MSG_DATA);
  }
  if (typeof v === "number") {
    const iso = dataDeSerial(v);
    return iso ? ok(iso) : erro(MSG_DATA);
  }
  const t = String(v).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) {
    const iso = isoDe(Number(m[3]), Number(m[2]), Number(m[1]));
    return iso ? ok(iso) : erro(MSG_DATA);
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(t);
  if (m) {
    const iso = isoDe(Number(m[1]), Number(m[2]), Number(m[3]));
    return iso ? ok(iso) : erro(MSG_DATA);
  }
  // Número escrito como texto ("45000"): também é serial do Excel.
  if (/^\d{5}$/.test(t)) {
    const iso = dataDeSerial(Number(t));
    if (iso) return ok(iso);
  }
  return erro(MSG_DATA);
}

/** Competência mensal: aceita mm/aaaa, aaaa-mm, ou qualquer data (vira o dia 1). Devolve "YYYY-MM-01". */
export function parseCompetencia(v: unknown): Resultado<string | null> {
  if (ehVazio(v)) return ok(null);
  if (typeof v === "string") {
    const t = v.trim();
    let m = /^(\d{1,2})[/.-](\d{4})$/.exec(t);
    if (m) {
      const iso = isoDe(Number(m[2]), Number(m[1]), 1);
      return iso ? ok(iso) : erro("Mês inválido: use mm/aaaa (ex.: 03/2026)");
    }
    m = /^(\d{4})-(\d{1,2})$/.exec(t);
    if (m) {
      const iso = isoDe(Number(m[1]), Number(m[2]), 1);
      return iso ? ok(iso) : erro("Mês inválido: use mm/aaaa (ex.: 03/2026)");
    }
  }
  const data = parseData(v);
  if (!data.ok) return erro("Mês inválido: use mm/aaaa (ex.: 03/2026)");
  return ok(data.valor ? `${data.valor.slice(0, 7)}-01` : null);
}

/** Dinheiro → centavos (inteiro). Aceita número, "1.234,56", "R$ 10", "-5,5", "(1.234,56)" e "1234.56". */
export function parseDinheiro(v: unknown): Resultado<number | null> {
  if (ehVazio(v)) return ok(null);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return erro("Valor inválido");
    const centavos = Math.round(v * 100);
    if (Math.abs(v * 100 - centavos) > 1e-6) return erro("Valor com mais de 2 casas decimais");
    return Number.isSafeInteger(centavos) ? ok(centavos) : erro("Valor grande demais");
  }
  let t = String(v).trim();
  let negativo = false;
  const paren = /^\((.*)\)$/.exec(t);
  if (paren) {
    negativo = true;
    t = paren[1]!;
  }
  const brl = parseBRL(t);
  if (brl !== null) return ok(negativo ? -brl : brl);
  // Formato com ponto decimal (1234.56), comum em CSV gerado por sistemas.
  const limpo = t.replace(/R\$/gi, "").replace(/[\s ]/g, "");
  if (/^-?\d+\.\d{1,2}$/.test(limpo)) {
    const n = Number(limpo);
    return ok(Math.round((negativo ? -n : n) * 100));
  }
  return erro("Valor inválido: use números como 1234,56");
}

/** Percentual de 0 a 100 → pontos-base. Aceita "12,5", "12,5%", número 12.5. */
export function parsePercentual(v: unknown): Resultado<number | null> {
  if (ehVazio(v)) return ok(null);
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else {
    const t = String(v).replace(/%/g, "").replace(/[\s ]/g, "");
    const m = /^(\d{1,3})(?:[,.](\d{1,4}))?$/.exec(t);
    if (!m) return erro("Percentual inválido: use de 0 a 100 (ex.: 12,5)");
    n = Number(`${m[1]}.${m[2] ?? "0"}`);
  }
  if (!Number.isFinite(n) || n < 0 || n > 100) return erro("Percentual deve estar entre 0 e 100");
  return ok(Math.round(n * 100));
}

export function parseInteiro(v: unknown): Resultado<number | null> {
  if (ehVazio(v)) return ok(null);
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  if (!Number.isInteger(n)) return erro("Informe um número inteiro");
  return ok(n);
}

const SIM = new Set(["sim", "s", "x", "1", "true", "verdadeiro", "yes", "y"]);
const NAO = new Set(["nao", "n", "0", "false", "falso", "no"]);

/** Vazio = não. */
export function parseSimNao(v: unknown): Resultado<boolean> {
  if (ehVazio(v)) return ok(false);
  const t = normalizarChave(String(v));
  if (SIM.has(t)) return ok(true);
  if (NAO.has(t)) return ok(false);
  return erro('Use "sim" ou "nao"');
}

/** Procura o texto (normalizado) num mapa de sinônimos. Vazio → null. */
export function parseLista<T extends string>(v: unknown, sinonimos: Record<string, T>, aceitos: string): Resultado<T | null> {
  if (ehVazio(v)) return ok(null);
  const t = normalizarChave(String(v));
  const achado = sinonimos[t];
  return achado ? ok(achado) : erro(`Valor inválido: use ${aceitos}`);
}
