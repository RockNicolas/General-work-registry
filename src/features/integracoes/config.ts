import { z } from "zod";

/**
 * Configuração de uma integração (coluna `integracao.config`, jsonb). Valores ausentes assumem os
 * padrões abaixo, então integrações antigas continuam válidas quando campos novos surgem.
 */
export const configIntegracaoSchema = z.object({
  /** Sienge: indexador de correção cadastrado no Sienge (parâmetro obrigatório do contas a pagar). */
  indexadorCorrecaoId: z.number().int().positive().optional(),
  /** Carga histórica: quantos meses para trás, por competência. */
  mesesHistorico: z.number().int().min(1).max(120).default(24),
  /** Sincronização normal: meses para trás que ainda são reprocessados (pagamentos, novas parcelas). */
  mesesReprocessar: z.number().int().min(1).max(24).default(3),
  /** Meses à frente (contas a pagar/receber projetadas). */
  mesesFuturos: z.number().int().min(0).max(24).default(6),
  /** Valor da baixa considerado realizado: líquido (desembolsado) ou bruto. */
  valorPagamento: z.enum(["liquido", "bruto"]).default("liquido"),
  /** Escala dos percentuais de execução que o ERP devolve. */
  escalaPercentual: z.enum(["0-100", "0-1"]).default("0-100"),
  sincronizarOrcamento: z.boolean().default(true),
  sincronizarAvanco: z.boolean().default(true),
  /** Quantos meses de avanço físico buscar (um chamada por mês e por obra). */
  mesesAvanco: z.number().int().min(1).max(24).default(3),
  /** Cria no RGO as categorias que o ERP usa (plano financeiro) e que ainda não existem. */
  criarCategoriasAutomaticamente: z.boolean().default(true),
  /** Eventos de webhook a registrar no ERP (nomes conforme a documentação de eventos do ERP). */
  eventosWebhook: z.array(z.string().min(1)).default([]),
});

export type ConfigIntegracao = z.infer<typeof configIntegracaoSchema>;

/** Lê o jsonb do banco aplicando os padrões. Config inválida cai nos padrões (nunca quebra a sincronização). */
export function lerConfig(bruto: unknown): ConfigIntegracao {
  const r = configIntegracaoSchema.safeParse(bruto ?? {});
  return r.success ? r.data : configIntegracaoSchema.parse({});
}

/** Cron (UTC) aceito para o agendamento: 5 campos, caracteres comuns, sem surpresas. */
export const CRON_VALIDO = /^[\d*/,\-]+( [\d*/,\-]+){4}$/;

/** Opções de agendamento oferecidas na tela (horário de Brasília = UTC−3). */
export const AGENDAMENTOS = [
  { value: "manual", label: "Somente manual", cron: null },
  { value: "6h", label: "A cada 6 horas", cron: "0 */6 * * *" },
  { value: "diaria", label: "Todo dia às 03:00 (Brasília)", cron: "0 6 * * *" },
  { value: "util", label: "Dias úteis às 07:00 e 13:00 (Brasília)", cron: "0 10,16 * * 1-5" },
] as const;
