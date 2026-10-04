/**
 * Modelo padrão de planilha: ÚNICA fonte da verdade das colunas. Dele saem o arquivo-modelo para
 * download, o leitor (cabeçalhos aceitos) e o texto de instruções. Nomes de coluna em snake_case.
 */
export const DATASETS = ["lancamentos", "orcamento", "avanco"] as const;
export type DatasetKey = (typeof DATASETS)[number];

export type ColunaModelo = {
  chave: string;
  obrigatoria: boolean;
  descricao: string;
  exemplo: string;
  tipo: "texto" | "data" | "mes" | "dinheiro" | "percentual" | "inteiro" | "lista";
  /** Valores aceitos, quando for lista. */
  opcoes?: string[];
  /** Outros nomes de cabeçalho aceitos (já normalizados: minúsculo, sem acento, com _). */
  apelidos?: string[];
};

export type DefinicaoDataset = {
  titulo: string;
  /** Nome da aba no .xlsx. */
  aba: string;
  /** Nomes de aba aceitos, normalizados (sem acento, minúsculos, sem espaços/_). */
  abasAceitas: string[];
  descricao: string;
  colunas: ColunaModelo[];
};

export const MODELO: Record<DatasetKey, DefinicaoDataset> = {
  lancamentos: {
    titulo: "Lançamentos (custos e receitas)",
    aba: "Lancamentos",
    abasAceitas: ["lancamentos", "lancamento"],
    descricao:
      "Uma linha por custo ou receita. Reimportar o mesmo arquivo não duplica: use id_externo para atualizar linhas já importadas.",
    colunas: [
      { chave: "id_externo", obrigatoria: false, tipo: "texto", descricao: "Identificador único da linha na sua origem. Com ele, reimportar ATUALIZA a linha em vez de criar outra.", exemplo: "NF-2026-0042", apelidos: ["id", "identificador"] },
      { chave: "codigo_obra", obrigatoria: true, tipo: "texto", descricao: "Código da obra, como cadastrado no sistema.", exemplo: "AUR-001", apelidos: ["obra", "cod_obra", "codigo"] },
      { chave: "tipo", obrigatoria: true, tipo: "lista", opcoes: ["custo", "receita"], descricao: "custo ou receita.", exemplo: "custo" },
      { chave: "data", obrigatoria: true, tipo: "data", descricao: "Data de competência (dd/mm/aaaa).", exemplo: "10/03/2026", apelidos: ["competencia", "data_competencia"] },
      { chave: "vencimento", obrigatoria: false, tipo: "data", descricao: "Data de vencimento (dd/mm/aaaa). Obrigatória se a situação for a_realizar.", exemplo: "20/03/2026", apelidos: ["data_vencimento"] },
      { chave: "data_pagamento", obrigatoria: false, tipo: "data", descricao: "Data do pagamento/recebimento (dd/mm/aaaa). Obrigatória se a situação for realizado.", exemplo: "18/03/2026", apelidos: ["pagamento", "data_recebimento", "data_liquidacao"] },
      { chave: "valor", obrigatoria: true, tipo: "dinheiro", descricao: "Valor em reais, ex.: 1234,56. Negativo para estorno. Não pode ser zero.", exemplo: "12345,67", apelidos: ["valor_r", "valor_rs"] },
      { chave: "categoria", obrigatoria: true, tipo: "texto", descricao: "Nome da categoria, igual ao cadastrado para a empresa.", exemplo: "Materiais de construção" },
      { chave: "etapa", obrigatoria: false, tipo: "texto", descricao: "Código da etapa da obra.", exemplo: "03", apelidos: ["codigo_etapa"] },
      { chave: "situacao", obrigatoria: false, tipo: "lista", opcoes: ["realizado", "a_realizar"], descricao: "realizado (pago/recebido) ou a_realizar (em aberto). Se vazio: realizado quando há data_pagamento, senão a_realizar.", exemplo: "realizado" },
      { chave: "classe", obrigatoria: false, tipo: "lista", opcoes: ["operacional", "aporte", "adiantamento", "devolucao_socio"], descricao: "Padrão: operacional. Aporte, adiantamento e devolução a sócios ficam fora da margem.", exemplo: "operacional" },
      { chave: "previsao", obrigatoria: false, tipo: "lista", opcoes: ["sim", "nao"], descricao: "sim para título de previsão (sem nota fiscal). Só vale para situação a_realizar.", exemplo: "nao", apelidos: ["titulo_previsao"] },
      { chave: "fornecedor_cliente", obrigatoria: false, tipo: "texto", descricao: "Fornecedor (custo) ou cliente (receita).", exemplo: "Cimento Forte", apelidos: ["fornecedor", "cliente", "contraparte"] },
      { chave: "documento", obrigatoria: false, tipo: "texto", descricao: "Número da nota fiscal ou título.", exemplo: "NF 1234", apelidos: ["nf", "nota_fiscal"] },
      { chave: "descricao", obrigatoria: false, tipo: "texto", descricao: "Observação livre.", exemplo: "Cimento CP-II 50 kg" },
    ],
  },
  orcamento: {
    titulo: "Orçamento (previsto)",
    aba: "Orcamento",
    abasAceitas: ["orcamento", "orcamentos"],
    descricao: "Valor previsto por obra, opcionalmente por etapa e categoria. Reimportar atualiza os itens com o mesmo id_externo.",
    colunas: [
      { chave: "id_externo", obrigatoria: false, tipo: "texto", descricao: "Identificador único do item. Com ele, reimportar atualiza o item.", exemplo: "ORC-001" },
      { chave: "codigo_obra", obrigatoria: true, tipo: "texto", descricao: "Código da obra, como cadastrado no sistema.", exemplo: "AUR-001", apelidos: ["obra", "cod_obra", "codigo"] },
      { chave: "etapa", obrigatoria: false, tipo: "texto", descricao: "Código da etapa da obra.", exemplo: "03", apelidos: ["codigo_etapa"] },
      { chave: "categoria", obrigatoria: false, tipo: "texto", descricao: "Nome da categoria, igual ao cadastrado.", exemplo: "Materiais de construção" },
      { chave: "valor_previsto", obrigatoria: true, tipo: "dinheiro", descricao: "Valor previsto em reais, ex.: 250000,00. Não pode ser negativo.", exemplo: "250000,00", apelidos: ["valor", "previsto"] },
      { chave: "versao", obrigatoria: false, tipo: "inteiro", descricao: "Versão do orçamento (padrão 1).", exemplo: "1" },
      { chave: "descricao", obrigatoria: false, tipo: "texto", descricao: "Observação livre.", exemplo: "Estrutura" },
    ],
  },
  avanco: {
    titulo: "Avanço físico (planejado × realizado)",
    aba: "AvancoFisico",
    abasAceitas: ["avancofisico", "avanco", "avancosfisicos"],
    descricao: "Percentuais mensais da obra. Reimportar substitui o mês/tipo/versão já lançado.",
    colunas: [
      { chave: "codigo_obra", obrigatoria: true, tipo: "texto", descricao: "Código da obra, como cadastrado no sistema.", exemplo: "AUR-001", apelidos: ["obra", "cod_obra", "codigo"] },
      { chave: "competencia", obrigatoria: true, tipo: "mes", descricao: "Mês de competência (mm/aaaa).", exemplo: "03/2026", apelidos: ["mes", "data"] },
      { chave: "tipo", obrigatoria: true, tipo: "lista", opcoes: ["planejado", "realizado"], descricao: "planejado ou realizado.", exemplo: "realizado" },
      { chave: "versao", obrigatoria: false, tipo: "inteiro", descricao: "0 = linha de base do planejamento; revisões usam 1, 2... (padrão 0).", exemplo: "0" },
      { chave: "pct_mes", obrigatoria: true, tipo: "percentual", descricao: "Percentual da obra no mês, de 0 a 100 (ex.: 4,5 para 4,5%).", exemplo: "4,5", apelidos: ["percentual_mes", "pct_no_mes"] },
      { chave: "pct_acum", obrigatoria: true, tipo: "percentual", descricao: "Percentual acumulado, de 0 a 100 (ex.: 35 para 35%). Não pode ser menor que o do mês.", exemplo: "35", apelidos: ["percentual_acumulado", "pct_acumulado"] },
    ],
  },
};

/** Normaliza texto para comparação: minúsculo, sem acentos, sem pontuação, espaços/hífens → "_". */
export function normalizarChave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Mapa cabeçalho normalizado → chave oficial da coluna, para um dataset. */
export function mapaDeCabecalhos(dataset: DatasetKey): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const c of MODELO[dataset].colunas) {
    mapa.set(normalizarChave(c.chave), c.chave);
    for (const a of c.apelidos ?? []) mapa.set(normalizarChave(a), c.chave);
  }
  return mapa;
}

/** Descobre a que dataset pertence uma aba do .xlsx pelo nome. */
export function datasetDaAba(nomeAba: string): DatasetKey | null {
  const n = nomeAba
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  for (const d of DATASETS) if (MODELO[d].abasAceitas.includes(n)) return d;
  return null;
}
