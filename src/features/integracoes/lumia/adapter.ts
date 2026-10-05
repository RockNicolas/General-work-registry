import {
  ErpNaoImplementado,
  type ErpAdapter,
  type LoteLancamentos,
  type ObraErp,
  type OrcamentoErp,
  type ResultadoConexao,
  iterableQueFalha,
} from "../erp/tipos";

const ROTULO = "Lumia";

/** Stub vazio: o cadastro da integração existe, mas nada é implementado até chegar a documentação. */
export class LumiaAdapter implements ErpAdapter {
  readonly erp = "lumia" as const;

  async testarConexao(): Promise<ResultadoConexao> {
    return { ok: false, erro: `A integração com a ${ROTULO} ainda não foi implementada: aguardando a documentação da API.` };
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
