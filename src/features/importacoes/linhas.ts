import { z } from "zod";
import type { LancamentoClasse, LancamentoSituacao, LancamentoTipo } from "@/lib/domain";
import {
  type Resultado,
  parseCompetencia,
  parseData,
  parseDinheiro,
  parseInteiro,
  parseLista,
  parsePercentual,
  parseSimNao,
  textoDe,
} from "./valores";

/**
 * Schemas Zod de UMA linha de cada dataset. Recebem as células cruas (texto/número/data) e
 * devolvem valores tipados; cada problema aponta para a coluna (path[0]) com mensagem em português.
 */

/** Adapta um parser de célula (valores.ts) a um schema Zod que reporta o erro na coluna. */
function celula<T>(parser: (v: unknown) => Resultado<T>) {
  return z.unknown().transform((v, ctx) => {
    const r = parser(v);
    if (!r.ok) {
      ctx.addIssue({ code: "custom", message: r.erro });
      return z.NEVER;
    }
    return r.valor;
  });
}

const texto = (max: number) =>
  z
    .unknown()
    .transform((v) => textoDe(v))
    .pipe(z.string().max(max, `Máximo de ${max} caracteres`))
    .transform((s) => (s === "" ? null : s));

const TIPO = { custo: "custo", despesa: "custo", gasto: "custo", receita: "receita", entrada: "receita" } as const satisfies Record<string, LancamentoTipo>;
const SITUACAO = {
  realizado: "realizado", pago: "realizado", paga: "realizado", recebido: "realizado", recebida: "realizado", liquidado: "realizado",
  a_realizar: "a_realizar", arealizar: "a_realizar", aberto: "a_realizar", em_aberto: "a_realizar", previsto: "a_realizar", pendente: "a_realizar",
} as const satisfies Record<string, LancamentoSituacao>;
const CLASSE = {
  operacional: "operacional", aporte: "aporte", adiantamento: "adiantamento",
  devolucao_socio: "devolucao_socio", devolucao_de_socio: "devolucao_socio", devolucao_a_socios: "devolucao_socio", devolucao_socios: "devolucao_socio",
} as const satisfies Record<string, LancamentoClasse>;
const TIPO_AVANCO = { planejado: "planejado", previsto: "planejado", realizado: "realizado" } as const;

const faltou = (ctx: z.RefinementCtx, coluna: string, mensagem: string) =>
  ctx.addIssue({ code: "custom", path: [coluna], message: mensagem });

// ---------- Lançamentos ----------

export const linhaLancamentoSchema = z
  .object({
    id_externo: texto(60),
    codigo_obra: texto(30),
    tipo: celula((v) => parseLista(v, TIPO, "custo ou receita")),
    data: celula(parseData),
    vencimento: celula(parseData),
    data_pagamento: celula(parseData),
    valor: celula(parseDinheiro),
    categoria: texto(80),
    etapa: texto(30),
    situacao: celula((v) => parseLista(v, SITUACAO, "realizado ou a_realizar")),
    classe: celula((v) => parseLista(v, CLASSE, "operacional, aporte, adiantamento ou devolucao_socio")),
    previsao: celula(parseSimNao),
    fornecedor_cliente: texto(160),
    documento: texto(60),
    descricao: texto(300),
  })
  .superRefine((d, ctx) => {
    if (!d.codigo_obra) faltou(ctx, "codigo_obra", "Informe o código da obra");
    if (!d.tipo) faltou(ctx, "tipo", "Informe o tipo (custo ou receita)");
    if (!d.data) faltou(ctx, "data", "Informe a data de competência");
    if (d.valor === null) faltou(ctx, "valor", "Informe o valor");
    else if (d.valor === 0) faltou(ctx, "valor", "O valor não pode ser zero");
    if (!d.categoria) faltou(ctx, "categoria", "Informe a categoria");

    const situacao = d.situacao ?? (d.data_pagamento ? "realizado" : "a_realizar");
    if (situacao === "realizado" && !d.data_pagamento) {
      faltou(ctx, "data_pagamento", "Informe a data do pagamento/recebimento (situação realizado)");
    }
    if (situacao === "a_realizar" && !d.vencimento) faltou(ctx, "vencimento", "Informe o vencimento (situação a_realizar)");
    if (d.previsao && situacao !== "a_realizar") faltou(ctx, "previsao", "Título de previsão só vale para situação a_realizar");
  })
  .transform((d) => ({
    ...d,
    situacao: (d.situacao ?? (d.data_pagamento ? "realizado" : "a_realizar")) as LancamentoSituacao,
    classe: (d.classe ?? "operacional") as LancamentoClasse,
  }));

export type LinhaLancamento = z.output<typeof linhaLancamentoSchema>;

// ---------- Orçamento ----------

export const linhaOrcamentoSchema = z
  .object({
    id_externo: texto(60),
    codigo_obra: texto(30),
    etapa: texto(30),
    categoria: texto(80),
    valor_previsto: celula(parseDinheiro),
    versao: celula(parseInteiro),
    descricao: texto(200),
  })
  .superRefine((d, ctx) => {
    if (!d.codigo_obra) faltou(ctx, "codigo_obra", "Informe o código da obra");
    if (d.valor_previsto === null) faltou(ctx, "valor_previsto", "Informe o valor previsto");
    else if (d.valor_previsto < 0) faltou(ctx, "valor_previsto", "O valor previsto não pode ser negativo");
    if (d.versao !== null && (d.versao < 1 || d.versao > 999)) faltou(ctx, "versao", "A versão deve ser de 1 a 999");
  })
  .transform((d) => ({ ...d, versao: d.versao ?? 1 }));

export type LinhaOrcamento = z.output<typeof linhaOrcamentoSchema>;

// ---------- Avanço físico ----------

export const linhaAvancoSchema = z
  .object({
    codigo_obra: texto(30),
    competencia: celula(parseCompetencia),
    tipo: celula((v) => parseLista(v, TIPO_AVANCO, "planejado ou realizado")),
    versao: celula(parseInteiro),
    pct_mes: celula(parsePercentual),
    pct_acum: celula(parsePercentual),
  })
  .superRefine((d, ctx) => {
    if (!d.codigo_obra) faltou(ctx, "codigo_obra", "Informe o código da obra");
    if (!d.competencia) faltou(ctx, "competencia", "Informe o mês de competência");
    if (!d.tipo) faltou(ctx, "tipo", "Informe o tipo (planejado ou realizado)");
    if (d.pct_mes === null) faltou(ctx, "pct_mes", "Informe o percentual do mês");
    if (d.pct_acum === null) faltou(ctx, "pct_acum", "Informe o percentual acumulado");
    if (d.pct_mes !== null && d.pct_acum !== null && d.pct_acum < d.pct_mes) {
      faltou(ctx, "pct_acum", "O acumulado não pode ser menor que o do mês");
    }
    if (d.versao !== null && (d.versao < 0 || d.versao > 99)) faltou(ctx, "versao", "A versão deve ser de 0 a 99");
  })
  .transform((d) => ({ ...d, versao: d.versao ?? 0 }));

export type LinhaAvanco = z.output<typeof linhaAvancoSchema>;
