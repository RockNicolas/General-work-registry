import { z } from "zod";
import { dataIsoValida } from "@/lib/dates";
import { LANCAMENTO_CLASSES, LANCAMENTO_SITUACOES, LANCAMENTO_TIPOS } from "@/lib/domain";

const dataObrigatoria = z.string().refine(dataIsoValida, "Informe uma data válida");
const dataOpcional = z.string().refine((v) => v === "" || dataIsoValida(v), "Data inválida");
const uuidOuVazio = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Valor inválido");

/** Lançamento manual (formulário). Importação e sincronização têm validação própria. */
export const lancamentoSchema = z
  .object({
    obraId: z.uuid(),
    tipo: z.enum(LANCAMENTO_TIPOS),
    situacao: z.enum(LANCAMENTO_SITUACOES),
    classe: z.enum(LANCAMENTO_CLASSES),
    isPrevisao: z.boolean(),
    /** Centavos; negativo é estorno. */
    valorCentavos: z
      .number({ error: "Informe um valor válido" })
      .int("Informe um valor válido")
      .refine((v) => v !== 0, "O valor não pode ser zero")
      .refine(Number.isSafeInteger, "Valor grande demais"),
    dataCompetencia: dataObrigatoria,
    dataVencimento: dataOpcional,
    dataLiquidacao: dataOpcional,
    categoriaId: z.string().min(1, "Escolha a categoria").pipe(z.uuid("Categoria inválida")),
    etapaId: uuidOuVazio,
    contraparte: z.string().trim().max(160, "Máximo de 160 caracteres"),
    documento: z.string().trim().max(60, "Máximo de 60 caracteres"),
    descricao: z.string().trim().max(300, "Máximo de 300 caracteres"),
  })
  .superRefine((d, ctx) => {
    if (d.situacao === "a_realizar" && !d.dataVencimento) {
      ctx.addIssue({ code: "custom", path: ["dataVencimento"], message: "Informe o vencimento" });
    }
    if (d.situacao === "realizado" && !d.dataLiquidacao) {
      ctx.addIssue({
        code: "custom",
        path: ["dataLiquidacao"],
        message: d.tipo === "custo" ? "Informe a data do pagamento" : "Informe a data do recebimento",
      });
    }
    if (d.isPrevisao && d.situacao !== "a_realizar") {
      ctx.addIssue({ code: "custom", path: ["isPrevisao"], message: "Título de previsão só vale para lançamentos a realizar" });
    }
  });

export type LancamentoInput = z.infer<typeof lancamentoSchema>;

/** Filtros da listagem, vindos da URL. Valores inválidos são descartados (nunca quebram a página). */
export const filtrosLancamentoSchema = z.object({
  tipo: z.enum(LANCAMENTO_TIPOS).optional().catch(undefined),
  situacao: z.enum(LANCAMENTO_SITUACOES).optional().catch(undefined),
  classe: z.enum(LANCAMENTO_CLASSES).optional().catch(undefined),
  de: dataOpcional.optional().catch(undefined),
  ate: dataOpcional.optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).max(100_000).catch(1),
});

export type FiltrosLancamento = z.infer<typeof filtrosLancamentoSchema>;
