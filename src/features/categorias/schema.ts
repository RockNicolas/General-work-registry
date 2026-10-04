import { z } from "zod";
import { CATEGORIA_GRUPOS } from "@/lib/domain";

export const categoriaSchema = z.object({
  empresaId: z.string().min(1, "Escolha a empresa"),
  nome: z.string().trim().min(2, "Informe o nome").max(80, "Máximo de 80 caracteres"),
  grupo: z.enum(CATEGORIA_GRUPOS),
  codigoOrigem: z.string().trim().max(60, "Máximo de 60 caracteres"),
});

export type CategoriaInput = z.infer<typeof categoriaSchema>;

export const categoriasPadraoSchema = z.object({ empresaId: z.string().min(1, "Escolha a empresa") });
