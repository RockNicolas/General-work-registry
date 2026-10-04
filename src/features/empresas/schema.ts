import { z } from "zod";
import { cnpjValido } from "@/lib/cnpj";

export const empresaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da empresa").max(120, "Máximo de 120 caracteres"),
  razaoSocial: z.string().trim().max(160, "Máximo de 160 caracteres"),
  cnpj: z
    .string()
    .trim()
    .refine((v) => v === "" || cnpjValido(v), "CNPJ inválido"),
  ativo: z.boolean(),
});

export type EmpresaInput = z.infer<typeof empresaSchema>;
