import type { CategoriaGrupo, Erp, LancamentoSituacao, LancamentoTipo } from "@/lib/domain";

/**
 * Contrato comum dos adaptadores de ERP. Cada adaptador converte o que o ERP devolve para estes
 * tipos internos; o resto do sistema (sincronização, gravação, dashboards) não conhece o ERP.
 * Todo valor monetário é inteiro em CENTAVOS e toda data é "YYYY-MM-DD".
 */

export type ObraErp = {
  /** Identificador da obra/centro de custo no ERP (texto). */
  idOrigem: string;
  nome: string;
  /** Rótulo do tipo no ERP (ex.: "Obra e centro de custo"). */
  tipo: string;
  empresaOrigem: string | null;
};

export type LancamentoErp = {
  /** Único dentro da integração; estável entre sincronizações (idempotência). */
  idOrigem: string;
  /** Documento de origem (ex.: parcela). Serve para varrer linhas que deixaram de existir no ERP. */
  grupoOrigem: string;
  obraOrigemId: string;
  tipo: LancamentoTipo;
  situacao: LancamentoSituacao;
  isPrevisao: boolean;
  valorCentavos: number;
  dataCompetencia: string;
  dataVencimento: string | null;
  dataLiquidacao: string | null;
  contraparte: string | null;
  documento: string | null;
  descricao: string | null;
  /** Plano financeiro do ERP; vira categoria do RGO. */
  categoria: { codigo: string; nome: string };
  /** Texto auxiliar para reconhecer aporte/adiantamento/devolução a sócios. */
  pistaClasse: string;
  /** Lançado direto no financeiro, sem apropriação ao orçamento da obra ("distorção"). */
  semApropriacaoOrcamento: boolean;
};

export type OrcamentoErp = {
  idOrigem: string;
  obraOrigemId: string;
  versao: number;
  etapa: { codigo: string; nome: string | null } | null;
  grupo: CategoriaGrupo;
  valorCentavos: number;
  descricao: string | null;
};

export type AvancoErp = {
  obraOrigemId: string;
  /** Primeiro dia do mês. */
  competencia: string;
  tipo: "planejado" | "realizado";
  versao: number;
  pctMesBps: number;
  pctAcumBps: number;
};

/** Período inclusivo, em datas ISO. */
export type Janela = { inicio: string; fim: string };

export type LoteLancamentos = {
  periodo: Janela;
  itens: LancamentoErp[];
  /** Quantos documentos (parcelas) o ERP devolveu neste período. */
  lidos: number;
  /** Parcelas ignoradas/problemas de dados, para o log. */
  avisos: string[];
};

export type ResultadoConexao = { ok: true; detalhe: string } | { ok: false; erro: string };

export interface ErpAdapter {
  readonly erp: Erp;
  testarConexao(): Promise<ResultadoConexao>;
  listarObras(): Promise<ObraErp[]>;
  /** Custos (contas a pagar e pagas), um lote por período, para não carregar tudo de uma vez. */
  listarCustos(janela: Janela): AsyncIterable<LoteLancamentos>;
  /** Receitas (contas a receber e recebidas). */
  listarReceitas(janela: Janela): AsyncIterable<LoteLancamentos>;
  /** Orçamento (previsto) da obra, na versão vigente. */
  listarOrcamento(obraOrigemId: string): Promise<OrcamentoErp[]>;
  /** Avanço físico mensal (planejado e realizado). Opcional: nem todo ERP expõe. */
  listarAvanco?(obraOrigemId: string, meses: string[]): Promise<AvancoErp[]>;
  /** Registra no ERP o endereço que receberá os eventos (webhook). Opcional. */
  registrarWebhook?(entrada: { url: string; token: string; eventos: string[] }): Promise<{ id: string }>;
}

/** O ERP existe no cadastro, mas o adaptador ainda não foi implementado. */
export class ErpNaoImplementado extends Error {
  constructor(erp: string, operacao: string) {
    super(`A integração com ${erp} ainda não implementa "${operacao}". Aguardando a documentação da API.`);
    this.name = "ErpNaoImplementado";
  }
}

/** Configuração inválida da integração (endereço, credenciais ausentes...). */
export class ErroConfiguracaoErp extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroConfiguracaoErp";
  }
}

/** AsyncIterable que falha ao ser percorrido (para adaptadores ainda não implementados). */
export function iterableQueFalha<T>(erro: Error): AsyncIterable<T> {
  return { [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(erro) }) };
}
