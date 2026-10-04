import { z } from "zod";

export const PAPEIS_VINCULO = ["empresa", "cliente"] as const;
export type PapelVinculo = (typeof PAPEIS_VINCULO)[number];

const vinculoSchema = z.object({
  empresaId: z.string().min(1, "Escolha a empresa"),
  papel: z.enum(PAPEIS_VINCULO),
  /** Obras liberadas; só vale para o papel "cliente". */
  obraIds: z.array(z.string()),
});

const base = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120, "Máximo de 120 caracteres"),
  email: z.email("E-mail inválido").max(160),
  admin: z.boolean(),
  ativo: z.boolean(),
  vinculos: z.array(vinculoSchema),
});

type DadosUsuario = z.infer<typeof base>;

/** Regras entre campos: quem não é administrador precisa de ao menos uma empresa, sem repetir. */
function regras(data: DadosUsuario, ctx: z.RefinementCtx) {
  if (data.admin) return;
  if (data.vinculos.length === 0) {
    ctx.addIssue({ code: "custom", path: ["vinculos"], message: "Vincule o usuário a pelo menos uma empresa." });
  }
  const vistas = new Set<string>();
  data.vinculos.forEach((v, i) => {
    if (v.empresaId && vistas.has(v.empresaId)) {
      ctx.addIssue({ code: "custom", path: ["vinculos", i, "empresaId"], message: "Empresa repetida." });
    }
    vistas.add(v.empresaId);
  });
}

export const criarUsuarioSchema = base
  .extend({ senha: z.string().min(8, "Mínimo de 8 caracteres").max(128, "Máximo de 128 caracteres") })
  .superRefine(regras);

export const atualizarUsuarioSchema = base.superRefine(regras);

export const redefinirSenhaSchema = z.object({
  senha: z.string().min(8, "Mínimo de 8 caracteres").max(128, "Máximo de 128 caracteres"),
});

export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;
export type AtualizarUsuarioInput = z.infer<typeof atualizarUsuarioSchema>;
