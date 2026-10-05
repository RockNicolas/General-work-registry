import { type OpcoesHttp, requisitar } from "../erp/http";
import { LimitadorTaxa } from "../erp/rate-limit";
import { ErroConfiguracaoErp } from "../erp/tipos";

/** Limites da API do Sienge, por usuário de API: REST 200/min, BULK 20/min (com folga de segurança). */
export const LIMITE_REST_POR_MINUTO = 180;
export const LIMITE_BULK_POR_MINUTO = 18;

export type Limitadores = { rest: LimitadorTaxa; bulk: LimitadorTaxa };

// Um par de limitadores por subdomínio, compartilhado por todas as sincronizações do processo.
const registro = new Map<string, Limitadores>();

export function limitadoresDe(chave: string): Limitadores {
  let l = registro.get(chave);
  if (!l) {
    l = { rest: new LimitadorTaxa(20, LIMITE_REST_POR_MINUTO), bulk: new LimitadorTaxa(3, LIMITE_BULK_POR_MINUTO) };
    registro.set(chave, l);
  }
  return l;
}

const SUBDOMINIO = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * Monta as URLs base a partir do "endereço" cadastrado:
 *  - subdomínio ("minhaconstrutora") → https://api.sienge.com.br/minhaconstrutora/public/api/...
 *  - URL completa só quando permitido (dev/teste): evita que a aplicação seja usada para chamar
 *    endereços arbitrários (SSRF) em produção.
 */
export function resolverBase(endereco: string, permitirCustom: boolean): { chave: string; rest: string; bulk: string } {
  const valor = endereco.trim();
  if (SUBDOMINIO.test(valor)) {
    const raiz = `https://api.sienge.com.br/${valor.toLowerCase()}/public/api`;
    return { chave: valor.toLowerCase(), rest: `${raiz}/v1`, bulk: `${raiz}/bulk-data/v1` };
  }
  if (/^https?:\/\//i.test(valor)) {
    if (!permitirCustom) {
      throw new ErroConfiguracaoErp("Informe apenas o subdomínio do Sienge (ex.: minhaconstrutora), sem https:// nem pontos.");
    }
    const raiz = `${valor.replace(/\/+$/, "")}/public/api`;
    return { chave: valor, rest: `${raiz}/v1`, bulk: `${raiz}/bulk-data/v1` };
  }
  throw new ErroConfiguracaoErp("Subdomínio do Sienge inválido: use apenas letras, números e hífen (ex.: minhaconstrutora).");
}

export type Consulta = Record<string, string | number | boolean | undefined>;

export type OpcoesCliente = {
  endereco: string;
  usuario: string;
  senha: string;
  permitirCustom?: boolean;
  http?: OpcoesHttp;
  /** Injetável para teste; por padrão, os compartilhados do subdomínio. */
  limitadores?: Limitadores;
};

export class SiengeClient {
  private readonly base: ReturnType<typeof resolverBase>;
  private readonly limitadores: Limitadores;
  private readonly authorization: string;

  constructor(private readonly opcoes: OpcoesCliente) {
    if (!opcoes.usuario || !opcoes.senha) throw new ErroConfiguracaoErp("Usuário e senha da API do Sienge são obrigatórios.");
    this.base = resolverBase(opcoes.endereco, opcoes.permitirCustom ?? false);
    this.limitadores = opcoes.limitadores ?? limitadoresDe(this.base.chave);
    this.authorization = `Basic ${Buffer.from(`${opcoes.usuario}:${opcoes.senha}`).toString("base64")}`;
  }

  /** GET na API REST (v1) ou BULK; devolve o JSON já decodificado. */
  async get(api: "rest" | "bulk", caminho: string, consulta: Consulta = {}): Promise<unknown> {
    const url = new URL(`${api === "rest" ? this.base.rest : this.base.bulk}${caminho}`);
    for (const [k, v] of Object.entries(consulta)) if (v !== undefined) url.searchParams.set(k, String(v));

    const resposta = await requisitar(
      url.toString(),
      { method: "GET", headers: { Authorization: this.authorization, Accept: "application/json" } },
      this.limitadores[api],
      { timeoutMs: api === "bulk" ? 180_000 : 60_000, ...this.opcoes.http },
    );
    try {
      return await resposta.json();
    } catch {
      throw new Error("O Sienge devolveu uma resposta que não é JSON válido.");
    }
  }

  /** POST JSON. Sem retentativas automáticas: criar algo duas vezes é pior que falhar. */
  async post(api: "rest" | "bulk", caminho: string, corpo: unknown): Promise<unknown> {
    const url = `${api === "rest" ? this.base.rest : this.base.bulk}${caminho}`;
    const resposta = await requisitar(
      url,
      { method: "POST", headers: { Authorization: this.authorization, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(corpo) },
      this.limitadores[api],
      { timeoutMs: 60_000, ...this.opcoes.http, maxTentativas: 1 },
    );
    return resposta.json().catch(() => ({}));
  }

  /** Percorre uma lista paginada da API REST (limit máximo 200), página a página. */
  async *paginar(caminho: string, consulta: Consulta = {}): AsyncGenerator<unknown[]> {
    const limit = 200;
    for (let offset = 0; ; offset += limit) {
      const pagina = (await this.get("rest", caminho, { ...consulta, limit, offset })) as {
        resultSetMetadata?: { count?: number };
        results?: unknown[];
      };
      const resultados = pagina.results ?? [];
      yield resultados;
      const total = pagina.resultSetMetadata?.count ?? 0;
      if (resultados.length === 0 || offset + limit >= total) return;
    }
  }
}
