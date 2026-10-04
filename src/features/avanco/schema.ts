import { z } from "zod";
import { AVANCO_TIPOS } from "@/lib/domain";
import { parsePercentBps } from "@/lib/percent";

const percentual = z.string().refine((v) => parsePercentBps(v) !== null, "Informe um percentual de 0 a 100 (ex.: 12,5)");

export const avancoSchema = z
  .object({
    obraId: z.uuid(),
    /** Valor de <input type="month">: "2026-03". Vira o dia 1 no servidor. */
    competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês de competência"),
    tipo: z.enum(AVANCO_TIPOS),
    /** 0 = linha de base do planejamento; revisões posteriores usam 1, 2, ... */
    versao: z.number({ error: "Informe a versão" }).int("Informe a versão").min(0, "Mínimo 0").max(99, "Máximo 99"),
    pctMes: percentual,
    pctAcum: percentual,
  })
  .refine((d) => (parsePercentBps(d.pctAcum) ?? 0) >= (parsePercentBps(d.pctMes) ?? 0), {
    path: ["pctAcum"],
    message: "O acumulado não pode ser menor que o do mês",
  });

export type AvancoInput = z.infer<typeof avancoSchema>;
