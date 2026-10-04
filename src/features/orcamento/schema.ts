import { z } from "zod";

const uuidOuVazio = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Valor inválido");

export const orcamentoSchema = z.object({
  obraId: z.uuid(),
  etapaId: uuidOuVazio,
  categoriaId: uuidOuVazio,
  descricao: z.string().trim().max(200, "Máximo de 200 caracteres"),
  /** Centavos. */
  valorPrevistoCentavos: z
    .number({ error: "Informe um valor válido" })
    .int("Informe um valor válido")
    .min(0, "O valor não pode ser negativo")
    .max(Number.MAX_SAFE_INTEGER, "Valor grande demais"),
  versao: z.number({ error: "Informe a versão" }).int().min(1, "Mínimo 1").max(999),
  vigente: z.boolean(),
});

export type OrcamentoInput = z.infer<typeof orcamentoSchema>;
