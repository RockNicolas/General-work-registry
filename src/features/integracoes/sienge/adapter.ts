import { ErroCredenciais, ErroHttp, ErroRede, type OpcoesHttp } from "../erp/http";
import { dividirEmMeses, hojeISO, ultimoDiaDoMes } from "../erp/periodos";
import {
  type AvancoErp,
  ErroConfiguracaoErp,
  type ErpAdapter,
  type Janela,
  type LancamentoErp,
  type LoteLancamentos,
  type ObraErp,
  type OrcamentoErp,
  type ResultadoConexao,
} from "../erp/tipos";
import { SiengeClient, type Limitadores } from "./client";
import {
  type EscalaPercentual,
  type OpcoesMapeamento,
  avancoDaObra,
  orcamentoDosItens,
  parcelaPagarParaLancamentos,
  parcelaReceberParaLancamentos,
  serieDeAvanco,
} from "./mappers";
import {
  empreendimentoSchema,
  itemOrcamentoSchema,
  parcelaPagarSchema,
  parcelaReceberSchema,
  respostaBulkSchema,
} from "./schemas";

export type ConfigSiengeAdapter = {
  endereco: string;
  usuario: string;
  senha: string;
  /** Indexador de correção cadastrado no Sienge (parâmetro obrigatório do /outcome). */
  indexadorCorrecaoId?: number;
  mapeamento: OpcoesMapeamento;
  escalaPercentual: EscalaPercentual;
  permitirCustom?: boolean;
  http?: OpcoesHttp;
  limitadores?: Limitadores;
  /** Para teste. */
  hoje?: () => string;
};

const TIPO_ROTULO: Record<string, string> = {
  "1": "Obra e centro de custo",
  "2": "Obra",
  "3": "Centro de custo",
  "4": "Centro de custo associado a obra",
};

/** Mensagem curta de por que um item da resposta foi descartado. */
const motivo = (erro: { issues: { path: PropertyKey[]; message: string }[] }) =>
  erro.issues
    .slice(0, 2)
    .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
    .join("; ");

export class SiengeAdapter implements ErpAdapter {
  readonly erp = "sienge" as const;
  private clienteCache?: SiengeClient;
  private readonly hoje: () => string;

  constructor(private readonly cfg: ConfigSiengeAdapter) {
    this.hoje = cfg.hoje ?? (() => hojeISO());
  }

  /** Criado sob demanda: configuração inválida (endereço, credenciais) aparece como erro legível na chamada, não ao construir. */
  private get client(): SiengeClient {
    this.clienteCache ??= new SiengeClient({
      endereco: this.cfg.endereco,
      usuario: this.cfg.usuario,
      senha: this.cfg.senha,
      permitirCustom: this.cfg.permitirCustom,
      http: this.cfg.http,
      limitadores: this.cfg.limitadores,
    });
    return this.clienteCache;
  }

  async testarConexao(): Promise<ResultadoConexao> {
    try {
      const pagina = (await this.client.get("rest", "/enterprises", { limit: 1 })) as { resultSetMetadata?: { count?: number } };
      const total = pagina.resultSetMetadata?.count ?? 0;
      return { ok: true, detalhe: `Conectado ao Sienge. ${total} empreendimento(s) disponível(is) para integração.` };
    } catch (erro) {
      return { ok: false, erro: mensagemDeErro(erro) };
    }
  }

  async listarObras(): Promise<ObraErp[]> {
    const obras: ObraErp[] = [];
    for await (const pagina of this.client.paginar("/enterprises")) {
      for (const bruto of pagina) {
        const e = empreendimentoSchema.safeParse(bruto);
        if (!e.success) continue;
        obras.push({
          idOrigem: String(e.data.id),
          nome: (e.data.commercialName || e.data.name || `Empreendimento ${e.data.id}`).trim(),
          tipo: TIPO_ROTULO[e.data.type ?? ""] ?? "Empreendimento",
          empresaOrigem: e.data.companyName ?? null,
        });
      }
    }
    return obras;
  }

  /** GET no bulk que trata 404 ("nenhuma parcela encontrada") como lista vazia. */
  private async bulkLista(caminho: string, consulta: Record<string, string | number | boolean>): Promise<unknown[]> {
    try {
      const json = await this.client.get("bulk", caminho, consulta);
      return respostaBulkSchema.parse(json).data;
    } catch (erro) {
      if (erro instanceof ErroHttp && erro.status === 404) return [];
      throw erro;
    }
  }

  async *listarCustos(janela: Janela): AsyncGenerator<LoteLancamentos> {
    if (!this.cfg.indexadorCorrecaoId) {
      throw new ErroConfiguracaoErp("Informe o indexador de correção do Sienge: o contas a pagar exige esse parâmetro.");
    }
    for (const periodo of dividirEmMeses(janela)) {
      const brutos = await this.bulkLista("/outcome", {
        startDate: periodo.inicio,
        endDate: periodo.fim,
        selectionType: "B", // data de competência
        correctionIndexerId: this.cfg.indexadorCorrecaoId,
        correctionDate: this.hoje(),
        withBankMovements: false,
        withAuthorizations: false,
      });
      yield this.converter(periodo, brutos, parcelaPagarSchema, (p) => parcelaPagarParaLancamentos(p, this.cfg.mapeamento));
    }
  }

  async *listarReceitas(janela: Janela): AsyncGenerator<LoteLancamentos> {
    for (const periodo of dividirEmMeses(janela)) {
      const brutos = await this.bulkLista("/income", {
        startDate: periodo.inicio,
        endDate: periodo.fim,
        selectionType: "B",
      });
      yield this.converter(periodo, brutos, parcelaReceberSchema, (p) => parcelaReceberParaLancamentos(p, this.cfg.mapeamento));
    }
  }

  private converter<P>(
    periodo: Janela,
    brutos: unknown[],
    schema: { safeParse: (v: unknown) => { success: true; data: P } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } },
    mapear: (p: P) => { itens: LancamentoErp[]; avisos: string[] },
  ): LoteLancamentos {
    const itens: LancamentoErp[] = [];
    const avisos: string[] = [];
    brutos.forEach((bruto, i) => {
      const r = schema.safeParse(bruto);
      if (!r.success) {
        avisos.push(`Parcela na posição ${i + 1} do período ${periodo.inicio} descartada (dados inesperados): ${motivo(r.error)}`);
        return;
      }
      const m = mapear(r.data);
      itens.push(...m.itens);
      avisos.push(...m.avisos);
    });
    return { periodo, itens, lidos: brutos.length, avisos };
  }

  private async itensDaObra(obraOrigemId: string, dataDate?: string) {
    const brutos = await this.bulkLista("/building-cost-estimation-items", {
      buildingId: obraOrigemId,
      ...(dataDate ? { dataDate } : {}),
    });
    return brutos.flatMap((b) => {
      const r = itemOrcamentoSchema.safeParse(b);
      return r.success ? [r.data] : [];
    });
  }

  /** POST /hooks: o Sienge passará a chamar `url` com o header `Authorization: Bearer <token>`. */
  async registrarWebhook(entrada: { url: string; token: string; eventos: string[] }): Promise<{ id: string }> {
    const r = (await this.client.post("rest", "/hooks", { url: entrada.url, token: entrada.token, events: entrada.eventos })) as { id?: string };
    return { id: String(r.id ?? "") };
  }

  async listarOrcamento(obraOrigemId: string): Promise<OrcamentoErp[]> {
    return orcamentoDosItens(await this.itensDaObra(obraOrigemId));
  }

  async listarAvanco(obraOrigemId: string, meses: string[]): Promise<AvancoErp[]> {
    if (meses.length === 0) return [];
    const hoje = this.hoje();
    const acumulados: { competencia: string; planejado: number; realizado: number }[] = [];
    for (const mes of [...meses].sort()) {
      const fim = ultimoDiaDoMes(mes);
      const itens = await this.itensDaObra(obraOrigemId, fim > hoje ? hoje : fim);
      const avanco = avancoDaObra(itens, this.cfg.escalaPercentual);
      if (avanco) acumulados.push({ competencia: `${mes}-01`, ...avanco });
    }
    const serie = serieDeAvanco(obraOrigemId, acumulados);
    // O primeiro mês só serve de referência para calcular o "no mês" dos seguintes.
    return acumulados.length > 1 ? serie.filter((s) => s.competencia !== acumulados[0]!.competencia) : serie;
  }
}

/** Texto para o usuário a partir de qualquer falha ao falar com o Sienge. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroCredenciais) return erro.message;
  if (erro instanceof ErroConfiguracaoErp) return erro.message;
  if (erro instanceof ErroRede) return erro.message;
  if (erro instanceof ErroHttp) {
    let detalhe = "";
    try {
      const j = JSON.parse(erro.corpo) as { clientMessage?: string; userMessage?: string[]; developerMessage?: string };
      detalhe = j.clientMessage ?? j.userMessage?.[0] ?? j.developerMessage ?? "";
    } catch {
      detalhe = erro.corpo.slice(0, 160);
    }
    return `${erro.message}${detalhe ? ` ${detalhe}` : ""}`.trim();
  }
  if (erro instanceof Error) {
    // Erros do banco (drizzle) trazem o motivo real em `cause`.
    const causa = (erro as { cause?: unknown }).cause;
    const detalhe = causa instanceof Error && causa.message ? ` — ${causa.message}` : "";
    return `${(erro.message.split(/\r?\n/)[0] ?? "").trim()}${detalhe}`.slice(0, 600);
  }
  return "Falha desconhecida.";
}
