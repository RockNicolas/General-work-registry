import { describe, expect, it } from "vitest";
import type { LancamentoRow } from "@/features/lancamentos/service";
import { metaExemplo } from "@/test/dashboard-exemplo";
import { gerarLancamentosPdf } from "./lancamentos-pdf";

/** Número de páginas lido do dicionário /Pages do próprio PDF. */
function paginas(pdf: Buffer): number {
  const m = /\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/.exec(pdf.toString("latin1"));
  return Number(m?.[1] ?? m?.[2] ?? 0);
}

const linha = (i: number, extra: Partial<LancamentoRow> = {}): LancamentoRow => ({
  id: `id-${i}`,
  tipo: "custo",
  situacao: "realizado",
  classe: "operacional",
  isPrevisao: false,
  valorCentavos: 100_00,
  dataCompetencia: "2026-03-10",
  dataVencimento: "2026-03-20",
  dataLiquidacao: "2026-03-18",
  categoriaId: "c1",
  categoriaNome: "Materiais",
  etapaId: null,
  etapaLabel: null,
  contraparte: "Fornecedor",
  documento: null,
  descricao: `Item ${i}`,
  origem: "manual",
  ...extra,
});

const totais = { total: 0, somaCustoCentavos: 0, somaReceitaCentavos: 0 };
const meta = { ...metaExemplo, titulo: "Lançamentos — OB-001" };

describe("gerarLancamentosPdf", () => {
  it("gera um PDF válido de uma página quando cabe no primeiro bloco", async () => {
    const pdf = await gerarLancamentosPdf([linha(1), linha(2, { tipo: "receita", valorCentavos: -5_000, dataVencimento: null })], { ...totais, total: 2 }, meta);
    const texto = pdf.toString("latin1");
    expect(texto.startsWith("%PDF-")).toBe(true);
    expect(texto.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(paginas(pdf)).toBe(1);
  });

  it("sem lançamentos: ainda gera o relatório, com uma página", async () => {
    const pdf = await gerarLancamentosPdf([], totais, meta);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(paginas(pdf)).toBe(1);
  });

  it("passa de 16 linhas: a tabela continua na página seguinte (24 por página)", async () => {
    expect(paginas(await gerarLancamentosPdf(Array.from({ length: 16 }, (_, i) => linha(i)), { ...totais, total: 16 }, meta))).toBe(1);
    expect(paginas(await gerarLancamentosPdf(Array.from({ length: 17 }, (_, i) => linha(i)), { ...totais, total: 17 }, meta))).toBe(2);
    expect(paginas(await gerarLancamentosPdf(Array.from({ length: 41 }, (_, i) => linha(i)), { ...totais, total: 41 }, meta))).toBe(3);
  });

  it("nomes com caracteres fora do Latin-1 não derrubam a geração", async () => {
    const row = linha(1, { descricao: "Item → “especial” ≥ 100 ✓", contraparte: "Sócio ✓" });
    await expect(gerarLancamentosPdf([row], { ...totais, total: 1 }, { ...meta, usuario: "Ana → Admin" })).resolves.toBeInstanceOf(Buffer);
  });
});
