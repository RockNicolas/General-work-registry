import { createHash } from "node:crypto";
import type { ZodType } from "zod";
import type { AvancoTipo, LancamentoClasse, LancamentoSituacao, LancamentoTipo } from "@/lib/domain";
import { linhaAvancoSchema, linhaLancamentoSchema, linhaOrcamentoSchema } from "./linhas";
import type { ArquivoCru, FolhaCrua } from "./ler-arquivo";
import { MODELO, normalizarChave } from "./modelo";
import { textoDe } from "./valores";

/** Linhas já validadas e com referências resolvidas, prontas para gravar. */
export type LancamentoImportar = {
  linha: number;
  obraId: string;
  etapaId: string | null;
  categoriaId: string;
  tipo: LancamentoTipo;
  situacao: LancamentoSituacao;
  classe: LancamentoClasse;
  isPrevisao: boolean;
  valorCentavos: number;
  dataCompetencia: string;
  dataVencimento: string | null;
  dataLiquidacao: string | null;
  contraparte: string | null;
  documento: string | null;
  descricao: string | null;
  idOrigem: string;
};

export type OrcamentoImportar = {
  linha: number;
  obraId: string;
  etapaId: string | null;
  categoriaId: string | null;
  descricao: string | null;
  valorPrevistoCentavos: number;
  versao: number;
  idOrigem: string;
};

export type AvancoImportar = {
  linha: number;
  obraId: string;
  competencia: string;
  tipo: AvancoTipo;
  versao: number;
  pctMesBps: number;
  pctAcumBps: number;
};

export type ErroLinha = {
  aba: string;
  /** 0 = problema do arquivo/aba como um todo. */
  linha: number;
  coluna: string | null;
  valor: string | null;
  mensagem: string;
};

export type Previa = {
  lancamentos: LancamentoImportar[];
  orcamento: OrcamentoImportar[];
  avanco: AvancoImportar[];
  erros: ErroLinha[];
  /** Linhas de dados lidas (todas as abas). */
  lidas: number;
  validas: number;
  /** Abas/colunas que existiam mas foram ignoradas (aviso, não erro). */
  avisos: string[];
};

/** Tabelas de consulta da empresa que está recebendo a importação. */
export type Referencias = {
  obraPorCodigo: Map<string, string>;
  categoriaPorNome: Map<string, string>;
  etapaPorObraCodigo: Map<string, string>;
};

export const chaveObra = (codigo: string) => codigo.trim().toUpperCase();
export const chaveCategoria = (nome: string) => normalizarChave(nome);
export const chaveEtapa = (obraId: string, codigo: string) => `${obraId}|${codigo.trim().toUpperCase()}`;

const hash = (partes: (string | number | null)[]) =>
  createHash("sha256").update(partes.map((p) => p ?? "").join("␟")).digest("hex").slice(0, 32);

/**
 * Identificador de idempotência. Com id_externo: "x:<id>" (reimportar ATUALIZA a linha).
 * Sem ele: "h:<hash do conteúdo>#<ocorrência>", de modo que a mesma linha reimportada não duplica
 * e duas linhas realmente idênticas no mesmo arquivo continuam sendo duas.
 */
function criarGeradorDeIds() {
  const vistos = new Map<string, number>();
  return (idExterno: string | null, conteudo: (string | number | null)[]): string => {
    if (idExterno) return `x:${idExterno}`;
    const base = hash(conteudo);
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return `h:${base}#${n}`;
  };
}

type Contexto = { ref: Referencias; erros: ErroLinha[] };

function coletarErros<T>(
  schema: ZodType<T>,
  folha: FolhaCrua,
  numero: number,
  valores: Record<string, unknown>,
  ctx: Contexto,
): T | null {
  const entrada = Object.fromEntries(MODELO[folha.dataset].colunas.map((c) => [c.chave, valores[c.chave] ?? null]));
  const r = schema.safeParse(entrada);
  if (r.success) return r.data;
  for (const issue of r.error.issues) {
    const coluna = typeof issue.path[0] === "string" ? issue.path[0] : null;
    ctx.erros.push({
      aba: folha.aba,
      linha: numero,
      coluna,
      valor: coluna ? textoDe(valores[coluna]) || null : null,
      mensagem: issue.message,
    });
  }
  return null;
}

function erro(ctx: Contexto, folha: FolhaCrua, linha: number, coluna: string, valor: string | null, mensagem: string) {
  ctx.erros.push({ aba: folha.aba, linha, coluna, valor, mensagem });
}

function resolverObra(ctx: Contexto, folha: FolhaCrua, linha: number, codigo: string): string | null {
  const id = ctx.ref.obraPorCodigo.get(chaveObra(codigo));
  if (!id) erro(ctx, folha, linha, "codigo_obra", codigo, `Obra "${codigo}" não encontrada nesta empresa`);
  return id ?? null;
}

function resolverEtapa(ctx: Contexto, folha: FolhaCrua, linha: number, obraId: string, codigo: string | null): { ok: boolean; id: string | null } {
  if (!codigo) return { ok: true, id: null };
  const id = ctx.ref.etapaPorObraCodigo.get(chaveEtapa(obraId, codigo));
  if (!id) {
    erro(ctx, folha, linha, "etapa", codigo, `Etapa "${codigo}" não encontrada nesta obra`);
    return { ok: false, id: null };
  }
  return { ok: true, id };
}

function resolverCategoria(ctx: Contexto, folha: FolhaCrua, linha: number, nome: string | null): { ok: boolean; id: string | null } {
  if (!nome) return { ok: true, id: null };
  const id = ctx.ref.categoriaPorNome.get(chaveCategoria(nome));
  if (!id) {
    erro(ctx, folha, linha, "categoria", nome, `Categoria "${nome}" não cadastrada para esta empresa`);
    return { ok: false, id: null };
  }
  return { ok: true, id };
}

/**
 * Valida todas as linhas do arquivo (Zod), resolve obra/etapa/categoria e monta o que será
 * gravado. Função pura: não toca no banco (as referências vêm prontas) nem grava nada.
 */
export function montarPrevia(arquivo: ArquivoCru, ref: Referencias): Previa {
  const ctx: Contexto = { ref, erros: [] };
  const previa: Previa = { lancamentos: [], orcamento: [], avanco: [], erros: [], lidas: 0, validas: 0, avisos: [] };

  for (const mensagem of arquivo.erros) ctx.erros.push({ aba: "Arquivo", linha: 0, coluna: null, valor: null, mensagem });

  for (const folha of arquivo.folhas) {
    if (folha.colunasIgnoradas.length > 0) {
      previa.avisos.push(`Aba ${folha.aba}: colunas ignoradas (não fazem parte do modelo): ${folha.colunasIgnoradas.join(", ")}`);
    }
    if (folha.colunasAusentes.length > 0) {
      for (const c of folha.colunasAusentes) {
        erro(ctx, folha, 1, c, null, `Coluna obrigatória "${c}" não encontrada no cabeçalho`);
      }
      continue; // sem as colunas obrigatórias não dá para validar as linhas
    }
    previa.lidas += folha.linhas.length;

    if (folha.dataset === "lancamentos") montarLancamentos(folha, ctx, previa);
    else if (folha.dataset === "orcamento") montarOrcamento(folha, ctx, previa);
    else montarAvanco(folha, ctx, previa);
  }

  previa.erros = ctx.erros.sort((a, b) => a.aba.localeCompare(b.aba) || a.linha - b.linha);
  const linhasComErro = new Set(previa.erros.filter((e) => e.linha > 0).map((e) => `${e.aba}#${e.linha}`));
  previa.validas = previa.lidas - linhasComErro.size;
  return previa;
}

function montarLancamentos(folha: FolhaCrua, ctx: Contexto, previa: Previa) {
  const gerarId = criarGeradorDeIds();
  const idsExternos = new Map<string, number>();

  for (const { numero, valores } of folha.linhas) {
    const d = coletarErros(linhaLancamentoSchema, folha, numero, valores, ctx);
    if (!d) continue;

    let valido = true;
    const obraId = resolverObra(ctx, folha, numero, d.codigo_obra!);
    if (!obraId) valido = false;
    const categoria = resolverCategoria(ctx, folha, numero, d.categoria);
    if (!categoria.ok) valido = false;
    const etapa = obraId ? resolverEtapa(ctx, folha, numero, obraId, d.etapa) : { ok: true, id: null };
    if (!etapa.ok) valido = false;

    if (d.id_externo) {
      const anterior = idsExternos.get(d.id_externo);
      if (anterior) {
        erro(ctx, folha, numero, "id_externo", d.id_externo, `id_externo repetido (já usado na linha ${anterior})`);
        valido = false;
      } else {
        idsExternos.set(d.id_externo, numero);
      }
    }
    if (!valido || !obraId || !categoria.id) continue;

    previa.lancamentos.push({
      linha: numero,
      obraId,
      etapaId: etapa.id,
      categoriaId: categoria.id,
      tipo: d.tipo!,
      situacao: d.situacao,
      classe: d.classe,
      isPrevisao: d.previsao,
      valorCentavos: d.valor!,
      dataCompetencia: d.data!,
      dataVencimento: d.vencimento,
      dataLiquidacao: d.data_pagamento,
      contraparte: d.fornecedor_cliente,
      documento: d.documento,
      descricao: d.descricao,
      idOrigem: gerarId(d.id_externo, [
        obraId, d.tipo!, d.data!, categoria.id, d.valor!, d.fornecedor_cliente, d.documento, d.descricao, d.vencimento, d.data_pagamento,
      ]),
    });
  }
}

function montarOrcamento(folha: FolhaCrua, ctx: Contexto, previa: Previa) {
  const gerarId = criarGeradorDeIds();
  const idsExternos = new Map<string, number>();

  for (const { numero, valores } of folha.linhas) {
    const d = coletarErros(linhaOrcamentoSchema, folha, numero, valores, ctx);
    if (!d) continue;

    let valido = true;
    const obraId = resolverObra(ctx, folha, numero, d.codigo_obra!);
    if (!obraId) valido = false;
    const categoria = resolverCategoria(ctx, folha, numero, d.categoria);
    if (!categoria.ok) valido = false;
    const etapa = obraId ? resolverEtapa(ctx, folha, numero, obraId, d.etapa) : { ok: true, id: null };
    if (!etapa.ok) valido = false;

    if (d.id_externo) {
      const anterior = idsExternos.get(d.id_externo);
      if (anterior) {
        erro(ctx, folha, numero, "id_externo", d.id_externo, `id_externo repetido (já usado na linha ${anterior})`);
        valido = false;
      } else {
        idsExternos.set(d.id_externo, numero);
      }
    }
    if (!valido || !obraId) continue;

    previa.orcamento.push({
      linha: numero,
      obraId,
      etapaId: etapa.id,
      categoriaId: categoria.id,
      descricao: d.descricao,
      valorPrevistoCentavos: d.valor_previsto!,
      versao: d.versao,
      // O valor fica de fora da chave: reimportar com valor novo ATUALIZA o item.
      idOrigem: gerarId(d.id_externo, [obraId, etapa.id, categoria.id, d.versao, d.descricao]),
    });
  }
}

function montarAvanco(folha: FolhaCrua, ctx: Contexto, previa: Previa) {
  const vistos = new Map<string, number>();

  for (const { numero, valores } of folha.linhas) {
    const d = coletarErros(linhaAvancoSchema, folha, numero, valores, ctx);
    if (!d) continue;

    const obraId = resolverObra(ctx, folha, numero, d.codigo_obra!);
    if (!obraId) continue;

    const chave = `${obraId}|${d.tipo}|${d.versao}|${d.competencia}`;
    const anterior = vistos.get(chave);
    if (anterior) {
      erro(ctx, folha, numero, "competencia", textoDe(valores.competencia) || null, `Mês/tipo/versão repetido (já usado na linha ${anterior})`);
      continue;
    }
    vistos.set(chave, numero);

    previa.avanco.push({
      linha: numero,
      obraId,
      competencia: d.competencia!,
      tipo: d.tipo!,
      versao: d.versao,
      pctMesBps: d.pct_mes!,
      pctAcumBps: d.pct_acum!,
    });
  }
}

