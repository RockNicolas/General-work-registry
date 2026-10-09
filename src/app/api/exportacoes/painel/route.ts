import { z } from "zod";
import { can } from "@/features/auth/policies";
import { getContextOrNull } from "@/features/auth/session";
import { resolverFiltros } from "@/features/dashboards/filtros";
import { hojeEmSaoPaulo } from "@/features/dashboards/periodo";
import { carregarDashboard, opcoesDeFiltro } from "@/features/dashboards/queries";
import { respostaArquivo, respostaErro } from "@/features/exportacoes/arquivos";
import { descreverFiltrosPainel, nomeDeArquivo } from "@/features/exportacoes/meta";
import { gerarPainelPdf } from "@/features/exportacoes/painel-pdf";
import { gerarPainelXlsx } from "@/features/exportacoes/painel-xlsx";
import { empresaDaAuditoria, registrarExportacao } from "@/features/exportacoes/service";

export const runtime = "nodejs";

const formatoSchema = z.enum(["xlsx", "pdf"]);

/**
 * Exporta o painel (os MESMOS números e filtros da tela) em Excel ou PDF. Qualquer perfil com
 * permissão de exportar relatório; cada um só recebe o que já enxerga. Fica registrado na auditoria.
 */
export async function GET(request: Request) {
  const ctx = await getContextOrNull();
  if (!ctx) return respostaErro(401, "Faça login para exportar.");
  if (!can(ctx, "exportar", "relatorio")) return respostaErro(403, "Você não tem permissão para exportar.");

  const params = new URL(request.url).searchParams;
  const formato = formatoSchema.safeParse(params.get("formato"));
  if (!formato.success) return respostaErro(400, "Informe o formato: xlsx ou pdf.");

  try {
    const geradoEm = new Date();
    const hoje = hojeEmSaoPaulo(geradoEm);
    const filtros = resolverFiltros(Object.fromEntries(params), hoje);
    const opcoes = await opcoesDeFiltro(ctx);
    const dados = await carregarDashboard(ctx, filtros, hoje);
    const meta = { titulo: "Painel de indicadores", geradoEm, usuario: ctx.nome, filtros: descreverFiltrosPainel(filtros, opcoes) };

    const arquivo = formato.data === "xlsx" ? await gerarPainelXlsx(dados, meta) : await gerarPainelPdf(dados, meta);

    await registrarExportacao(ctx, {
      empresaId: empresaDaAuditoria(opcoes.empresas, filtros.empresaId),
      entidade: "painel",
      resumo: `Painel exportado em ${formato.data.toUpperCase()} (${filtros.de} a ${filtros.ate})`,
      depois: { formato: formato.data, filtros, obras: dados.obras.length },
    });

    return respostaArquivo(arquivo, nomeDeArquivo(["painel", filtros.de, "a", filtros.ate], formato.data), formato.data);
  } catch (erro) {
    console.error("[exportacao] painel:", erro instanceof Error ? erro.message : erro);
    return respostaErro(500, "Não foi possível gerar o relatório. Tente novamente.");
  }
}
