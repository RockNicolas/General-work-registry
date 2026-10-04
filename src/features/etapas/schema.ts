import { z } from "zod";

const uuidOuVazio = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Valor inválido");

export const etapaSchema = z.object({
  obraId: z.uuid(),
  codigo: z.string().trim().min(1, "Informe o código").max(30, "Máximo de 30 caracteres"),
  nome: z.string().trim().min(2, "Informe o nome").max(160, "Máximo de 160 caracteres"),
  /** Etapa-pai (vazio = etapa de primeiro nível). */
  paiId: uuidOuVazio,
});

export type EtapaInput = z.infer<typeof etapaSchema>;
