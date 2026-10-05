import { z } from "zod";

/**
 * Formato das respostas da API do Sienge (conforme os OpenAPI publicados em
 * api.sienge.com.br/docs: enterprise-v1, bulk-data-outcome-v1, bulk-data-income-v1,
 * bulk-data-building-cost-estimations-v1). Só os campos usados; o resto é ignorado.
 * Tudo é tolerante a nulo: o Sienge omite campos vazios, e uma parcela com dado estranho não pode
 * derrubar o lote inteiro (cada item é validado sozinho).
 */
const n = z.number().nullish();
const s = z.string().nullish();

export const empreendimentoSchema = z.looseObject({
  id: z.number(),
  name: s,
  commercialName: s,
  type: s,
  companyId: n,
  companyName: s,
});
export type Empreendimento = z.infer<typeof empreendimentoSchema>;

export const paginaEmpreendimentosSchema = z.looseObject({
  resultSetMetadata: z.looseObject({ count: z.number(), offset: z.number().nullish(), limit: z.number().nullish() }),
  results: z.array(z.unknown()),
});

const apropriacaoFinanceira = z.looseObject({
  costCenterId: n,
  costCenterName: s,
  financialCategoryId: s,
  financialCategoryName: s,
  financialCategoryType: s,
  /** Percentual (0–100) da parcela apropriado a este centro de custo/plano financeiro. */
  financialCategoryRate: n,
});

const apropriacaoObra = z.looseObject({ buildingId: n, buildingName: s, rate: n });

const baixa = z.looseObject({
  operationTypeId: n,
  operationTypeName: s,
  sequencialNumber: n,
  grossAmount: n,
  netAmount: n,
  paymentDate: s,
  calculationDate: s,
});

/** Parcela do contas a pagar (bulk-data /outcome). */
export const parcelaPagarSchema = z.looseObject({
  billId: z.number(),
  installmentId: z.number(),
  creditorName: s,
  documentIdentificationId: s,
  documentNumber: s,
  /** Documento de previsão financeira: preenchido nos títulos de previsão. */
  forecastDocument: s,
  originalAmount: n,
  balanceAmount: n,
  dueDate: s,
  issueDate: s,
  /** Data de competência. */
  billDate: s,
  paymentsCategories: z.array(apropriacaoFinanceira).nullish(),
  buildingsCosts: z.array(apropriacaoObra).nullish(),
  payments: z.array(baixa).nullish(),
});
export type ParcelaPagar = z.infer<typeof parcelaPagarSchema>;

const recibo = z.looseObject({
  operationTypeId: n,
  operationTypeName: s,
  grossAmount: n,
  netAmount: n,
  paymentDate: s,
  calculationDate: s,
});

/** Parcela do contas a receber (bulk-data /income). */
export const parcelaReceberSchema = z.looseObject({
  billId: z.number(),
  installmentId: z.number(),
  clientName: s,
  documentIdentificationId: s,
  documentNumber: s,
  /** "Informa se tem ou não Documento de Previsão". */
  documentForecast: s,
  originalAmount: n,
  balanceAmount: n,
  dueDate: s,
  issueDate: s,
  billDate: s,
  receiptsCategories: z.array(apropriacaoFinanceira).nullish(),
  receipts: z.array(recibo).nullish(),
});
export type ParcelaReceber = z.infer<typeof parcelaReceberSchema>;

export const respostaBulkSchema = z.looseObject({ data: z.array(z.unknown()) });

const precoPorTipo = z.looseObject({ category: s, totalPrice: n });

/** Item de orçamento (bulk-data /building-cost-estimation-items). */
export const itemOrcamentoSchema = z.looseObject({
  buildingId: z.number(),
  buildingName: s,
  versionNumber: n,
  /** Posição na EDT, ex.: "01.02.003". */
  wbsCode: s,
  /** Nulo nos itens agrupadores (etapas/subetapas). */
  workItemId: n,
  description: s,
  totalPrice: n,
  pricesByCategory: z.array(precoPorTipo).nullish(),
  scheduledPercentComplete: n,
  percentComplete: n,
  /** Presente apenas no objeto extra de erro ao final da lista. */
  "api-error": s,
});
export type ItemOrcamento = z.infer<typeof itemOrcamentoSchema>;
