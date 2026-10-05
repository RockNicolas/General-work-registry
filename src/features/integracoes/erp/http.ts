import type { LimitadorTaxa } from "./rate-limit";

/** Erro de uma resposta HTTP do ERP (já sem retentativas possíveis). */
export class ErroHttp extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
    readonly corpo: string,
    readonly tentativas: number,
  ) {
    super(mensagem);
    this.name = "ErroHttp";
  }
}

/** 401/403: usuário ou senha da API recusados. Não adianta tentar de novo. */
export class ErroCredenciais extends ErroHttp {
  constructor(status: number, corpo: string, tentativas: number) {
    super("O ERP recusou o usuário/senha da API (verifique as credenciais e as permissões do usuário de API).", status, corpo, tentativas);
    this.name = "ErroCredenciais";
  }
}

/** Falha de rede/timeout depois de esgotar as tentativas. */
export class ErroRede extends Error {
  constructor(mensagem: string, readonly tentativas: number, readonly causa?: unknown) {
    super(mensagem);
    this.name = "ErroRede";
  }
}

export type OpcoesHttp = {
  /** Total de tentativas por chamada (a primeira conta). */
  maxTentativas?: number;
  timeoutMs?: number;
  /** Base do backoff exponencial. */
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  /** Injetáveis para teste. */
  dormir?: (ms: number) => Promise<void>;
  aleatorio?: () => number;
  fetchImpl?: typeof fetch;
};

const PADRAO = { maxTentativas: 5, timeoutMs: 60_000, baseBackoffMs: 1_000, maxBackoffMs: 60_000 };
const STATUS_REPETIVEIS = new Set([408, 429, 500, 502, 503, 504]);

/** Backoff exponencial com "jitter completo": espera aleatória entre 0 e min(max, base·2^(n-1)). */
export function calcularBackoff(tentativa: number, baseMs: number, maxMs: number, aleatorio: () => number = Math.random): number {
  const teto = Math.min(maxMs, baseMs * 2 ** (tentativa - 1));
  return Math.round(aleatorio() * teto);
}

/** Retry-After: número de segundos ou data HTTP. Devolve milissegundos, ou null. */
export function lerRetryAfter(valor: string | null, agora: number = Date.now()): number | null {
  if (!valor) return null;
  const segundos = Number(valor);
  if (Number.isFinite(segundos) && segundos >= 0) return Math.round(segundos * 1000);
  const data = Date.parse(valor);
  return Number.isNaN(data) ? null : Math.max(0, data - agora);
}

const dormirReal = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Faz a requisição respeitando o limitador e repetindo quando faz sentido:
 * rede/timeout, 408, 429, 500, 502, 503 e 504 — com backoff exponencial e, se o servidor mandar,
 * Retry-After. Outros 4xx NÃO se repetem. 401/403 viram ErroCredenciais.
 */
export async function requisitar(
  url: string,
  init: RequestInit,
  limitador: LimitadorTaxa,
  opcoes: OpcoesHttp = {},
): Promise<Response> {
  const { maxTentativas, timeoutMs, baseBackoffMs, maxBackoffMs } = { ...PADRAO, ...opcoes };
  const dormir = opcoes.dormir ?? dormirReal;
  const aleatorio = opcoes.aleatorio ?? Math.random;
  const executar = opcoes.fetchImpl ?? fetch;

  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    await limitador.adquirir();

    let resposta: Response | undefined;
    try {
      resposta = await executar(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (erro) {
      ultimoErro = erro;
    }

    if (resposta) {
      if (resposta.ok) return resposta;

      const corpo = await resposta.text().catch(() => "");
      if (resposta.status === 401 || resposta.status === 403) throw new ErroCredenciais(resposta.status, corpo, tentativa);
      if (!STATUS_REPETIVEIS.has(resposta.status)) {
        throw new ErroHttp(`O ERP respondeu ${resposta.status}.`, resposta.status, corpo, tentativa);
      }

      ultimoErro = new ErroHttp(`O ERP respondeu ${resposta.status}.`, resposta.status, corpo, tentativa);
      if (tentativa === maxTentativas) throw ultimoErro;

      const retryAfter = lerRetryAfter(resposta.headers.get("retry-after"));
      if (resposta.status === 429) {
        // O ERP mandou parar: segura TODAS as chamadas deste limitador pelo tempo pedido (ou o backoff).
        const espera = retryAfter ?? calcularBackoff(tentativa, baseBackoffMs, maxBackoffMs, aleatorio);
        limitador.pausar(espera);
        continue;
      }
      await dormir(retryAfter ?? calcularBackoff(tentativa, baseBackoffMs, maxBackoffMs, aleatorio));
      continue;
    }

    if (tentativa === maxTentativas) break;
    await dormir(calcularBackoff(tentativa, baseBackoffMs, maxBackoffMs, aleatorio));
  }

  const timeout = ultimoErro instanceof Error && (ultimoErro.name === "TimeoutError" || ultimoErro.name === "AbortError");
  throw new ErroRede(
    timeout ? `O ERP não respondeu em ${timeoutMs / 1000} s (tentativas esgotadas).` : "Não foi possível conectar ao ERP (tentativas esgotadas).",
    maxTentativas,
    ultimoErro,
  );
}
