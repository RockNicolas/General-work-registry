import { z } from "zod";
import { can } from "@/features/auth/policies";
import { getContextOrNull } from "@/features/auth/session";
import { respostaArquivo, respostaErro } from "@/features/exportacoes/arquivos";
import { gerarLancamentosPdf } from "@/features/exportacoes/lancamentos-pdf";
import { gerarLancamentosXlsx } from "@/features/exportacoes/lancamentos-xlsx";
import { dataParaArquivo, descreverFiltrosLancamentos, nomeDeArquivo } from "@/features/exportacoes/meta";
import { registrarExportacao } from "@/features/exportacoes/service";
import { filtrosLancamentoSchema } from "@/features/lancamentos/schema";
import { LIMITE_EXPORTACAO_LANCAMENTOS, LIMITE_EXPORTACAO_LANCAMENTOS_PDF, listarLancamentosParaExportar } from "@/features/lancamentos/service";
import { buscarObra } from "@/features/obras/service";

export const runtime = "nodejs";

const formatoSchema = z.enum(["xlsx", "pdf"]);

/**
 * Exporta os lançamentos de UMA obra (Excel ou PDF), com os mesmos filtros da lista (sem paginar).
 * Cada perfil só exporta obras que já enxerga; acima do limite de linhas, pede para refinar os filtros.
 */
export async function GET(request: Request) {
  const ctx = await getContextOrNull();
  if (!ctx) return respostaErro(401, "Faça login para exportar.");
  if (!can(ctx, "exportar", "relatorio")) return respostaErro(403, "Você não tem permissão para exportar.");

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const obraId = z.uuid().safeParse(params.obra);
  if (!obraId.success) return respostaErro(400, "Informe a obra.");
  const formato = formatoSchema.safeParse(params.formato ?? "xlsx");
  if (!formato.success) return respostaErro(400, "Informe o formato: xlsx ou pdf.");
  const escolhido = formato.data;

  try {
    const obra = await buscarObra(ctx, obraId.data);
    if (!obra) return respostaErro(404, "Obra não encontrada.");

    const filtros = filtrosLancamentoSchema.parse(params);
    const limite = escolhido === "pdf" ? LIMITE_EXPORTACAO_LANCAMENTOS_PDF : LIMITE_EXPORTACAO_LANCAMENTOS;
    const dados = await listarLancamentosParaExportar(ctx, obra.id, filtros, limite);
    if (dados.excedeLimite) {
      const total = dados.total.toLocaleString("pt-BR");
      const teto = limite.toLocaleString("pt-BR");
      const detalhe =
        escolhido === "pdf"
          ? `o PDF cabe até ${teto}. Para o conjunto todo, exporte em Excel ou refine os filtros.`
          : `o limite é ${teto} por exportação. Refine os filtros (período, tipo, busca).`;
      return respostaErro(413, `São ${total} lançamentos: ${detalhe}`);
    }

    const geradoEm = new Date();
    const meta = { titulo: `Lançamentos — ${obra.codigo}`, geradoEm, usuario: ctx.nome, filtros: descreverFiltrosLancamentos(obra, filtros) };
    const arquivo = escolhido === "xlsx" ? await gerarLancamentosXlsx(dados.rows, dados, meta) : await gerarLancamentosPdf(dados.rows, dados, meta);

    await registrarExportacao(ctx, {
      empresaId: obra.empresaId,
      entidade: "lancamento",
      entidadeId: obra.id,
      resumo: `Lançamentos exportados em ${escolhido.toUpperCase()}: ${obra.codigo} (${dados.rows.length} linha(s))`,
      depois: { formato: escolhido, linhas: dados.rows.length, filtros: { ...filtros, pagina: undefined } },
    });

    return respostaArquivo(arquivo, nomeDeArquivo(["lancamentos", obra.codigo, dataParaArquivo(geradoEm)], escolhido), escolhido);
  } catch (erro) {
    console.error("[exportacao] lancamentos:", erro instanceof Error ? erro.message : erro);
    return respostaErro(500, escolhido === "pdf" ? "Não foi possível gerar o PDF. Tente novamente." : "Não foi possível gerar a planilha. Tente novamente.");
  }
}
