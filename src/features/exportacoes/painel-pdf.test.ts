import { describe, expect, it } from "vitest";
import { dashboardExemplo, metaExemplo } from "@/test/dashboard-exemplo";
import { gerarPainelPdf } from "./painel-pdf";

/** Número de páginas lido do dicionário /Pages do próprio PDF. */
function paginas(pdf: Buffer): number {
  const m = /\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/.exec(pdf.toString("latin1"));
  return Number(m?.[1] ?? m?.[2] ?? 0);
}

describe("gerarPainelPdf", () => {
  it("gera um PDF válido (cabeçalho, trailer e metadados) com as 5 seções", async () => {
    const pdf = await gerarPainelPdf(dashboardExemplo(), metaExemplo);
    const texto = pdf.toString("latin1");
    expect(texto.startsWith("%PDF-")).toBe(true);
    expect(texto.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(texto).toContain("Painel de indicadores"); // /Title nos metadados
    expect(paginas(pdf)).toBe(5); // resumo, obras, custos, avanço+vencimentos, fora da margem
  });

  it("muitas obras: a tabela segue em mais páginas (16 por página), sem perder nenhuma", async () => {
    const pdf = await gerarPainelPdf(dashboardExemplo(40), metaExemplo);
    expect(paginas(pdf)).toBe(5 + 2); // 40 obras = 3 páginas de obras (16+16+8), em vez de 1
  });

  it("sem nenhum dado: ainda gera o relatório, com as mesmas páginas", async () => {
    const d = dashboardExemplo(0, 1);
    d.evolucao = [];
    d.grupos = [];
    d.categorias = [];
    d.etapas = [];
    d.avanco = [];
    d.foraDaMargem = [];
    const pdf = await gerarPainelPdf(d, metaExemplo);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(paginas(pdf)).toBe(5);
  });

  it("janela longa (60 meses): o gráfico continua cabendo e o arquivo é gerado", async () => {
    const pdf = await gerarPainelPdf(dashboardExemplo(3, 60), metaExemplo);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(paginas(pdf)).toBe(5); // sem a tabela mensal (só até 12 meses), nada transborda
  });

  it("nomes com caracteres fora do Latin-1 não derrubam a geração", async () => {
    const d = dashboardExemplo(1);
    d.obras[0]!.nome = "Obra → “especial” ≥ 100 ✓";
    await expect(gerarPainelPdf(d, metaExemplo)).resolves.toBeInstanceOf(Buffer);
  });
});
