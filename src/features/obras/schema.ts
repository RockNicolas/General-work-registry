import { z } from "zod";
import { dataIsoValida } from "@/lib/dates";
import { OBRA_STATUS, UFS } from "@/lib/domain";

const dataOpcional = z.string().refine((v) => v === "" || dataIsoValida(v), "Data inválida");

export const obraSchema = z
  .object({
    empresaId: z.string().min(1, "Escolha a empresa"),
    codigo: z.string().trim().min(1, "Informe o código").max(30, "Máximo de 30 caracteres"),
    nome: z.string().trim().min(2, "Informe o nome da obra").max(160, "Máximo de 160 caracteres"),
    status: z.enum(OBRA_STATUS),
    dataInicio: dataOpcional,
    dataFimPrevista: dataOpcional,
    cidade: z.string().trim().max(80, "Máximo de 80 caracteres"),
    uf: z.string().refine((v) => v === "" || (UFS as readonly string[]).includes(v), "UF inválida"),
  })
  .refine((d) => !d.dataInicio || !d.dataFimPrevista || d.dataInicio <= d.dataFimPrevista, {
    path: ["dataFimPrevista"],
    message: "O fim previsto não pode ser antes do início",
  });

export type ObraInput = z.infer<typeof obraSchema>;
