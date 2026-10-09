import type { FiltrosDashboard } from "@/features/dashboards/filtros";
import { rotuloMes } from "@/features/dashboards/periodo";
import { formatDateTimeBR } from "@/lib/dates";
import { CATEGORIA_GRUPO_LABEL, LANCAMENTO_CLASSE_LABEL, type LancamentoClasse } from "@/lib/domain";
import { slugify } from "@/lib/slug";

/** O que todo relatório carrega no cabeçalho: de onde veio, com que filtros, quem gerou e quando. */
export type MetaRelatorio = {
  titulo: string;
  /** Instante da geração (exibido em horário de Brasília). */
  geradoEm: Date;
  usuario: string;
  filtros: { rotulo: string; valor: string }[];
};

type Opcoes = {
  empresas: { id: string; nome: string }[];
  obras: { id: string; codigo: string; nome: string }[];
};

/** Os filtros do painel em texto, com NOMES (nunca ids) e só o que o usuário pode ver. */
export function descreverFiltrosPainel(f: FiltrosDashboard, opcoes: Opcoes): MetaRelatorio["filtros"] {
  const empresa = f.empresaId ? opcoes.empresas.find((e) => e.id === f.empresaId)?.nome : undefined;
  const obra = f.obraId ? opcoes.obras.find((o) => o.id === f.obraId) : undefined;
  return [
    { rotulo: "Período", valor: f.de === f.ate ? rotuloMes(f.de) : `${rotuloMes(f.de)} a ${rotuloMes(f.ate)}` },
    { rotulo: "Empresa", valor: f.empresaId ? (empresa ?? "(não disponível)") : "Todas as que você acompanha" },
    { rotulo: "Obra", valor: f.obraId ? (obra ? `${obra.codigo} — ${obra.nome}` : "(não disponível)") : "Todas as obras" },
    { rotulo: "Grupo de custo", valor: f.grupo ? CATEGORIA_GRUPO_LABEL[f.grupo] : "Todos os grupos" },
  ];
}

export const textoGeradoEm = (meta: Pick<MetaRelatorio, "geradoEm">): string => formatDateTimeBR(meta.geradoEm);

/** Nome de arquivo seguro (ASCII, sem espaços): "rgo-painel-2025-11_a_2026-10.xlsx". */
export function nomeDeArquivo(partes: string[], extensao: "xlsx" | "pdf"): string {
  const corpo = partes
    .map((p) => slugify(p))
    .filter(Boolean)
    .join("-");
  return `rgo-${corpo || "relatorio"}.${extensao}`;
}

type FiltrosLancamentosTexto = { tipo?: string; situacao?: string; classe?: string; de?: string; ate?: string; q?: string };

/** Os filtros da lista de lançamentos em texto, para o cabeçalho da planilha. */
export function descreverFiltrosLancamentos(obra: { codigo: string; nome: string; empresaNome: string }, f: FiltrosLancamentosTexto): MetaRelatorio["filtros"] {
  const itens: MetaRelatorio["filtros"] = [
    { rotulo: "Empresa", valor: obra.empresaNome },
    { rotulo: "Obra", valor: `${obra.codigo} — ${obra.nome}` },
  ];
  const dataBR = (iso: string) => iso.split("-").reverse().join("/");
  if (f.tipo) itens.push({ rotulo: "Tipo", valor: f.tipo === "custo" ? "Custo" : "Receita" });
  if (f.situacao) itens.push({ rotulo: "Situação", valor: f.situacao === "realizado" ? "Realizado" : "A realizar" });
  if (f.classe && f.classe in LANCAMENTO_CLASSE_LABEL) itens.push({ rotulo: "Classe", valor: LANCAMENTO_CLASSE_LABEL[f.classe as LancamentoClasse] });
  if (f.de) itens.push({ rotulo: "Competência a partir de", valor: dataBR(f.de) });
  if (f.ate) itens.push({ rotulo: "Competência até", valor: dataBR(f.ate) });
  if (f.q) itens.push({ rotulo: "Busca", valor: f.q });
  if (itens.length === 2) itens.push({ rotulo: "Filtros", valor: "nenhum (todos os lançamentos da obra)" });
  return itens;
}

/** Instante → "20261004" (data de Brasília), para sufixo de nome de arquivo. */
export function dataParaArquivo(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(instante).replaceAll("-", "");
}
