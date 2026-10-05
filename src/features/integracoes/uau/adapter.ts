import {
  ErroConfiguracaoErp,
  ErpNaoImplementado,
  type ErpAdapter,
  type LoteLancamentos,
  type ObraErp,
  type OrcamentoErp,
  type ResultadoConexao,
  iterableQueFalha,
} from "../erp/tipos";

export type ConfigUauAdapter = {
  /** URL HTTPS da UAU API. */
  endereco: string;
  usuario: string;
  senha: string;
};

const ROTULO = "UAU (Senior)";

/**
 * Esqueleto da integração com a UAU (Senior): guarda e valida a configuração (URL HTTPS + usuário
 * e senha técnicos), mas ainda NÃO fala com a API, porque os endpoints e o fluxo de autenticação
 * dependem da documentação do cliente. Cada operação falha com uma mensagem clara; quando a
 * documentação chegar, o contrato (ErpAdapter) e a sincronização já estão prontos.
 */
export class UauAdapter implements ErpAdapter {
  readonly erp = "uau" as const;

  constructor(private readonly cfg: ConfigUauAdapter) {}

  async testarConexao(): Promise<ResultadoConexao> {
    try {
      validarEndereco(this.cfg.endereco);
      if (!this.cfg.usuario || !this.cfg.senha) throw new ErroConfiguracaoErp("Usuário e senha técnicos da UAU são obrigatórios.");
    } catch (erro) {
      return { ok: false, erro: erro instanceof Error ? erro.message : "Configuração inválida." };
    }
    return {
      ok: false,
      erro: `A configuração da ${ROTULO} foi salva e é válida, mas a conexão ainda não pode ser testada: a integração aguarda a documentação da API (endpoints e autenticação).`,
    };
  }

  async listarObras(): Promise<ObraErp[]> {
    throw new ErpNaoImplementado(ROTULO, "listar obras");
  }

  listarCustos(): AsyncIterable<LoteLancamentos> {
    return iterableQueFalha(new ErpNaoImplementado(ROTULO, "listar custos"));
  }

  listarReceitas(): AsyncIterable<LoteLancamentos> {
    return iterableQueFalha(new ErpNaoImplementado(ROTULO, "listar receitas"));
  }

  async listarOrcamento(): Promise<OrcamentoErp[]> {
    throw new ErpNaoImplementado(ROTULO, "listar orçamento");
  }
}

/** A UAU API é acessada por HTTPS; recusa http, endereços com credenciais embutidas e hosts locais. */
export function validarEndereco(endereco: string): URL {
  let url: URL;
  try {
    url = new URL(endereco.trim());
  } catch {
    throw new ErroConfiguracaoErp("Informe a URL completa da UAU API (ex.: https://uau.suaempresa.com.br).");
  }
  if (url.protocol !== "https:") throw new ErroConfiguracaoErp("A URL da UAU API deve usar HTTPS.");
  if (url.username || url.password) throw new ErroConfiguracaoErp("Não coloque usuário e senha dentro da URL; use os campos próprios.");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/i.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) {
    throw new ErroConfiguracaoErp("Endereços locais/privados não são permitidos.");
  }
  return url;
}
