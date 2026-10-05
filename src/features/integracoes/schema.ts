import { z } from "zod";
import { ERPS } from "@/lib/domain";
import { AGENDAMENTOS } from "./config";
import { resolverBase } from "./sienge/client";
import { validarEndereco } from "./uau/adapter";

const AGENDAMENTO_CHAVES = AGENDAMENTOS.map((a) => a.value) as [string, ...string[]];

/** Campos comuns. Nas edições, usuário/senha em branco significam "manter os atuais". */
const base = z.object({
  empresaId: z.string().min(1, "Escolha a empresa"),
  erp: z.enum(ERPS),
  nome: z.string().trim().min(2, "Informe um nome").max(80, "Máximo de 80 caracteres"),
  /** Sienge: subdomínio. UAU: URL HTTPS. */
  endereco: z.string().trim().min(1, "Informe o endereço").max(200),
  usuario: z.string().trim().max(120),
  senha: z.string().max(200),
  agendamento: z.enum(AGENDAMENTO_CHAVES),
  indexadorCorrecaoId: z.number({ error: "Informe um número" }).int().positive("Deve ser positivo").nullable(),
  mesesHistorico: z.number({ error: "Informe um número" }).int().min(1, "Mínimo 1").max(120, "Máximo 120"),
  mesesReprocessar: z.number({ error: "Informe um número" }).int().min(1, "Mínimo 1").max(24, "Máximo 24"),
  mesesFuturos: z.number({ error: "Informe um número" }).int().min(0, "Mínimo 0").max(24, "Máximo 24"),
  valorPagamento: z.enum(["liquido", "bruto"]),
  escalaPercentual: z.enum(["0-100", "0-1"]),
  sincronizarOrcamento: z.boolean(),
  sincronizarAvanco: z.boolean(),
});

/** Regras que dependem do ERP escolhido. */
function porErp(d: z.infer<typeof base>, ctx: z.RefinementCtx) {
  const erro = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (d.erp === "sienge") {
    try {
      resolverBase(d.endereco, false);
    } catch (e) {
      erro("endereco", e instanceof Error ? e.message : "Subdomínio inválido");
    }
    if (d.indexadorCorrecaoId === null) erro("indexadorCorrecaoId", "Informe o código do indexador de correção cadastrado no Sienge");
  }
  if (d.erp === "uau") {
    try {
      validarEndereco(d.endereco);
    } catch (e) {
      erro("endereco", e instanceof Error ? e.message : "URL inválida");
    }
  }
}

export const criarIntegracaoSchema = base
  .extend({
    usuario: z.string().trim().min(1, "Informe o usuário da API").max(120),
    senha: z.string().min(1, "Informe a senha da API").max(200),
  })
  .superRefine(porErp);

export const atualizarIntegracaoSchema = base.superRefine(porErp);

export type CriarIntegracaoInput = z.infer<typeof criarIntegracaoSchema>;
export type AtualizarIntegracaoInput = z.infer<typeof atualizarIntegracaoSchema>;

export const vinculosSchema = z.object({
  integracaoId: z.uuid(),
  vinculos: z
    .array(z.object({ idOrigem: z.string().min(1).max(60), obraId: z.uuid() }))
    .superRefine((v, ctx) => {
      const origens = new Set<string>();
      const obras = new Set<string>();
      v.forEach((x, i) => {
        if (origens.has(x.idOrigem)) ctx.addIssue({ code: "custom", path: [i, "idOrigem"], message: "Obra do ERP repetida" });
        if (obras.has(x.obraId)) ctx.addIssue({ code: "custom", path: [i, "obraId"], message: "Obra do RGO vinculada duas vezes" });
        origens.add(x.idOrigem);
        obras.add(x.obraId);
      });
    }),
});

export const criarObrasDoErpSchema = z.object({
  integracaoId: z.uuid(),
  obras: z.array(z.object({ idOrigem: z.string().min(1).max(60), nome: z.string().min(1).max(200) })).min(1, "Selecione ao menos uma obra"),
});
