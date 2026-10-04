/**
 * Vocabulário do domínio: valores aceitos e rótulos em pt-BR. Sem dependências de servidor,
 * então vale tanto para o schema do banco quanto para validação (Zod) e telas.
 */

export const OBRA_STATUS = ["planejada", "ativa", "pausada", "concluida"] as const;
export type ObraStatus = (typeof OBRA_STATUS)[number];
export const OBRA_STATUS_LABEL: Record<ObraStatus, string> = {
  planejada: "Planejada",
  ativa: "Ativa",
  pausada: "Pausada",
  concluida: "Concluída",
};

/** Grupo de custo: base das perguntas "% comprometido com materiais, M&E, MOD/MOI". */
export const CATEGORIA_GRUPOS = [
  "material",
  "maquinas_equipamentos",
  "mao_obra_direta",
  "mao_obra_indireta",
  "servicos",
  "outros",
  "receita",
] as const;
export type CategoriaGrupo = (typeof CATEGORIA_GRUPOS)[number];
export const CATEGORIA_GRUPO_LABEL: Record<CategoriaGrupo, string> = {
  material: "Materiais",
  maquinas_equipamentos: "Máquinas e equipamentos",
  mao_obra_direta: "Mão de obra direta (MOD)",
  mao_obra_indireta: "Mão de obra indireta (MOI)",
  servicos: "Serviços",
  outros: "Outros",
  receita: "Receita",
};

export const LANCAMENTO_TIPOS = ["custo", "receita"] as const;
export type LancamentoTipo = (typeof LANCAMENTO_TIPOS)[number];
export const LANCAMENTO_TIPO_LABEL: Record<LancamentoTipo, string> = {
  custo: "Custo",
  receita: "Receita",
};

/** realizado = pago/recebido (incorrido); a_realizar = em aberto (a pagar/a receber). */
export const LANCAMENTO_SITUACOES = ["realizado", "a_realizar"] as const;
export type LancamentoSituacao = (typeof LANCAMENTO_SITUACOES)[number];
export const LANCAMENTO_SITUACAO_LABEL: Record<LancamentoSituacao, string> = {
  realizado: "Realizado",
  a_realizar: "A realizar",
};

/** Só "operacional" entra no cálculo de margem; os demais são movimentos de caixa dos sócios/clientes. */
export const LANCAMENTO_CLASSES = ["operacional", "aporte", "adiantamento", "devolucao_socio"] as const;
export type LancamentoClasse = (typeof LANCAMENTO_CLASSES)[number];
export const LANCAMENTO_CLASSE_LABEL: Record<LancamentoClasse, string> = {
  operacional: "Operacional",
  aporte: "Aporte",
  adiantamento: "Adiantamento",
  devolucao_socio: "Devolução a sócios",
};

export const ORIGENS = ["erp", "planilha", "manual"] as const;
export type Origem = (typeof ORIGENS)[number];
export const ORIGEM_LABEL: Record<Origem, string> = {
  erp: "ERP",
  planilha: "Planilha",
  manual: "Manual",
};

export const AVANCO_TIPOS = ["planejado", "realizado"] as const;
export type AvancoTipo = (typeof AVANCO_TIPOS)[number];
export const AVANCO_TIPO_LABEL: Record<AvancoTipo, string> = {
  planejado: "Planejado",
  realizado: "Realizado",
};

export const ERPS = ["sienge", "uau", "lumia"] as const;
export type Erp = (typeof ERPS)[number];
export const ERP_LABEL: Record<Erp, string> = { sienge: "Sienge", uau: "UAU (Senior)", lumia: "Lumia" };

export const INTEGRACAO_STATUS = ["ativa", "erro", "pausada"] as const;
export type IntegracaoStatus = (typeof INTEGRACAO_STATUS)[number];

export const SYNC_GATILHOS = ["manual", "agendada", "webhook", "carga_historica"] as const;
export type SyncGatilho = (typeof SYNC_GATILHOS)[number];

export const SYNC_STATUS = ["enfileirada", "executando", "concluida", "concluida_com_erros", "falhou"] as const;
export type SyncStatus = (typeof SYNC_STATUS)[number];

export const IMPORTACAO_STATUS = ["previa", "processando", "concluida", "concluida_com_erros", "falhou"] as const;
export type ImportacaoStatus = (typeof IMPORTACAO_STATUS)[number];

export const AUDITORIA_ACOES = ["criar", "editar", "excluir", "importar", "sincronizar", "exportar"] as const;
export type AuditoriaAcao = (typeof AUDITORIA_ACOES)[number];

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
