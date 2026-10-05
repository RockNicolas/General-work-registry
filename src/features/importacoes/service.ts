import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { registrarAuditoria } from "@/features/auditoria/registrar";
import type { AppContext } from "@/features/auth/context";
import { ActionError } from "@/lib/action-result";
import { upsertAvanco } from "@/features/avanco/upsert";
import { CONTAGEM_ZERO, type ContagemConjunto, somarContagens, upsertLancamentos } from "@/features/lancamentos/upsert";
import { upsertOrcamento } from "@/features/orcamento/upsert";
import type { ImportacaoStatus } from "@/lib/domain";
import { categoria, etapa, importacao, importacaoErro, obra, organization } from "@/server/db/schema";
import { type Tx, withScope } from "@/server/db/scope";
import { lerArquivo } from "./ler-arquivo";
import { type DatasetKey } from "./modelo";
import {
  type AvancoImportar,
  type ErroLinha,
  type LancamentoImportar,
  type OrcamentoImportar,
  type Previa,
  type Referencias,
  chaveCategoria,
  chaveEtapa,
  chaveObra,
  montarPrevia,
} from "./montar-previa";

const MAX_ERROS_GUARDADOS = 1000;
const AMOSTRA = 50;

/** O que fica guardado entre a prévia e a confirmação. */
export type PayloadPrevia = {
  lancamentos: LancamentoImportar[];
  orcamento: OrcamentoImportar[];
  avanco: AvancoImportar[];
  avisos: string[];
};

export type { ContagemConjunto };
export type ResumoImportacao = {
  errosTotal?: number;
  lancamentos?: ContagemConjunto;
  orcamento?: ContagemConjunto;
  avanco?: ContagemConjunto;
  /** Mensagem quando a gravação falhou. */
  erro?: string;
};

export type ImportacaoRow = {
  id: string;
  empresaId: string;
  empresaNome: string;
  arquivoNome: string;
  status: ImportacaoStatus;
  total: number;
  ok: number;
  comErro: number;
  usuarioNome: string | null;
  criadoEm: string;
};

const colunas = {
  id: importacao.id,
  empresaId: importacao.empresaId,
  empresaNome: organization.name,
  arquivoNome: importacao.arquivoNome,
  status: importacao.status,
  total: importacao.total,
  ok: importacao.ok,
  comErro: importacao.comErro,
  usuarioNome: importacao.usuarioNome,
  criadoEm: importacao.createdAt,
};

export async function listarImportacoes(ctx: AppContext): Promise<ImportacaoRow[]> {
  const rows = await withScope(ctx, (tx) =>
    tx
      .select(colunas)
      .from(importacao)
      .innerJoin(organization, eq(organization.id, importacao.empresaId))
      .orderBy(desc(importacao.createdAt))
      .limit(100),
  );
  return rows.map((r) => ({ ...r, criadoEm: r.criadoEm.toISOString() }));
}

export type DetalheImportacao = ImportacaoRow & {
  resumo: ResumoImportacao | null;
  erros: ErroLinha[];
  errosTotal: number;
  avisos: string[];
  contagens: { lancamentos: number; orcamento: number; avanco: number };
  amostra: { lancamentos: LancamentoImportar[]; orcamento: OrcamentoImportar[]; avanco: AvancoImportar[] };
  /** Quando o MESMO arquivo (mesmo conteúdo) já foi importado antes nesta empresa. */
  jaImportadoEm: string | null;
  /** Rótulos para exibir (id → texto) das referências da amostra. */
  rotulos: { obras: Record<string, string>; categorias: Record<string, string>; etapas: Record<string, string> };
};

export async function obterImportacao(ctx: AppContext, id: string): Promise<DetalheImportacao | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  return withScope(ctx, async (tx) => {
    const [imp] = await tx
      .select({ ...colunas, hash: importacao.arquivoHash, payload: importacao.payload, resumo: importacao.resumo })
      .from(importacao)
      .innerJoin(organization, eq(organization.id, importacao.empresaId))
      .where(eq(importacao.id, id));
    if (!imp) return null;

    const erros = await tx
      .select({
        aba: importacaoErro.aba,
        linha: importacaoErro.linha,
        coluna: importacaoErro.coluna,
        valor: importacaoErro.valor,
        mensagem: importacaoErro.mensagem,
      })
      .from(importacaoErro)
      .where(eq(importacaoErro.importacaoId, id))
      .orderBy(asc(importacaoErro.aba), asc(importacaoErro.linha))
      .limit(MAX_ERROS_GUARDADOS);

    const [anterior] = await tx
      .select({ em: importacao.createdAt })
      .from(importacao)
      .where(
        and(
          eq(importacao.empresaId, imp.empresaId),
          eq(importacao.arquivoHash, imp.hash),
          ne(importacao.id, id),
          inArray(importacao.status, ["concluida", "concluida_com_erros"]),
        ),
      )
      .orderBy(desc(importacao.createdAt))
      .limit(1);

    const payload = (imp.payload as PayloadPrevia | null) ?? { lancamentos: [], orcamento: [], avanco: [], avisos: [] };
    const amostra = {
      lancamentos: payload.lancamentos.slice(0, AMOSTRA),
      orcamento: payload.orcamento.slice(0, AMOSTRA),
      avanco: payload.avanco.slice(0, AMOSTRA),
    };

    // Rótulos legíveis para a amostra (código da obra, nome da categoria, etapa).
    const obraIds = new Set<string>();
    const categoriaIds = new Set<string>();
    const etapaIds = new Set<string>();
    for (const l of amostra.lancamentos) {
      obraIds.add(l.obraId);
      categoriaIds.add(l.categoriaId);
      if (l.etapaId) etapaIds.add(l.etapaId);
    }
    for (const o of amostra.orcamento) {
      obraIds.add(o.obraId);
      if (o.categoriaId) categoriaIds.add(o.categoriaId);
      if (o.etapaId) etapaIds.add(o.etapaId);
    }
    for (const a of amostra.avanco) obraIds.add(a.obraId);

    // Sequencial: dentro de uma transação todas as consultas dividem a mesma conexão.
    const obras = obraIds.size ? await tx.select({ id: obra.id, codigo: obra.codigo }).from(obra).where(inArray(obra.id, [...obraIds])) : [];
    const categorias = categoriaIds.size ? await tx.select({ id: categoria.id, nome: categoria.nome }).from(categoria).where(inArray(categoria.id, [...categoriaIds])) : [];
    const etapas = etapaIds.size ? await tx.select({ id: etapa.id, codigo: etapa.codigo, nome: etapa.nome }).from(etapa).where(inArray(etapa.id, [...etapaIds])) : [];

    const resumo = (imp.resumo as ResumoImportacao | null) ?? null;
    return {
      id: imp.id,
      empresaId: imp.empresaId,
      empresaNome: imp.empresaNome,
      arquivoNome: imp.arquivoNome,
      status: imp.status,
      total: imp.total,
      ok: imp.ok,
      comErro: imp.comErro,
      usuarioNome: imp.usuarioNome,
      criadoEm: imp.criadoEm.toISOString(),
      resumo,
      erros: erros.map((e) => ({ ...e, aba: e.aba ?? "" })),
      errosTotal: resumo?.errosTotal ?? erros.length,
      avisos: payload.avisos,
      contagens: { lancamentos: payload.lancamentos.length, orcamento: payload.orcamento.length, avanco: payload.avanco.length },
      amostra,
      jaImportadoEm: anterior ? anterior.em.toISOString() : null,
      rotulos: {
        obras: Object.fromEntries(obras.map((o) => [o.id, o.codigo])),
        categorias: Object.fromEntries(categorias.map((c) => [c.id, c.nome])),
        etapas: Object.fromEntries(etapas.map((e) => [e.id, `${e.codigo} — ${e.nome}`])),
      },
    };
  });
}

// ---------- Prévia ----------

async function carregarReferencias(tx: Tx, empresaId: string): Promise<Referencias> {
  const obras = await tx.select({ id: obra.id, codigo: obra.codigo }).from(obra).where(eq(obra.empresaId, empresaId));
  const categorias = await tx.select({ id: categoria.id, nome: categoria.nome }).from(categoria).where(eq(categoria.empresaId, empresaId));
  const etapas = await tx.select({ id: etapa.id, obraId: etapa.obraId, codigo: etapa.codigo }).from(etapa).where(eq(etapa.empresaId, empresaId));
  return {
    obraPorCodigo: new Map(obras.map((o) => [chaveObra(o.codigo), o.id])),
    categoriaPorNome: new Map(categorias.map((c) => [chaveCategoria(c.nome), c.id])),
    etapaPorObraCodigo: new Map(etapas.map((e) => [chaveEtapa(e.obraId, e.codigo), e.id])),
  };
}

export async function criarPrevia(
  ctx: AppContext,
  entrada: { empresaId: string; arquivoNome: string; bytes: Uint8Array; datasetCsv?: DatasetKey },
): Promise<{ id: string }> {
  const arquivo = lerArquivo(entrada.bytes, entrada.arquivoNome, entrada.datasetCsv);
  const hash = createHash("sha256").update(entrada.bytes).digest("hex");

  return withScope(ctx, async (tx) => {
    const [empresa] = await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, entrada.empresaId));
    if (!empresa) throw new ActionError("Empresa não encontrada.", { empresaId: "Empresa inválida" });

    const previa: Previa = montarPrevia(arquivo, await carregarReferencias(tx, entrada.empresaId));
    const payload: PayloadPrevia = {
      lancamentos: previa.lancamentos,
      orcamento: previa.orcamento,
      avanco: previa.avanco,
      avisos: previa.avisos,
    };
    const validas = previa.lancamentos.length + previa.orcamento.length + previa.avanco.length;
    const comErro = previa.lidas - previa.validas;

    const [criada] = await tx
      .insert(importacao)
      .values({
        empresaId: entrada.empresaId,
        usuarioId: ctx.userId,
        usuarioNome: ctx.nome,
        arquivoNome: entrada.arquivoNome.slice(0, 200),
        arquivoHash: hash,
        // Sem nenhuma linha utilizável não há o que confirmar.
        status: validas > 0 ? "previa" : "falhou",
        total: previa.lidas,
        ok: validas,
        comErro: Math.max(0, comErro),
        payload: validas > 0 ? payload : null,
        resumo: { errosTotal: previa.erros.length } satisfies ResumoImportacao,
      })
      .returning({ id: importacao.id });

    const guardar = previa.erros.slice(0, MAX_ERROS_GUARDADOS);
    for (let i = 0; i < guardar.length; i += 500) {
      await tx.insert(importacaoErro).values(
        guardar.slice(i, i + 500).map((e) => ({
          empresaId: entrada.empresaId,
          importacaoId: criada!.id,
          aba: e.aba,
          linha: e.linha,
          coluna: e.coluna,
          valor: e.valor?.slice(0, 200) ?? null,
          mensagem: e.mensagem,
        })),
      );
    }
    return { id: criada!.id };
  });
}

// ---------- Confirmação ----------


async function gravarLancamentos(tx: Tx, empresaId: string, importacaoId: string, itens: LancamentoImportar[]): Promise<ContagemConjunto> {
  return upsertLancamentos(
    tx,
    { empresaId, origem: "planilha", integracaoId: null, importacaoId },
    itens.map((l) => ({ ...l, classe: l.classe })),
  );
}

async function gravarOrcamento(tx: Tx, empresaId: string, itens: OrcamentoImportar[]): Promise<ContagemConjunto> {
  const total = await upsertOrcamento(
    tx,
    { empresaId, origem: "planilha" },
    itens.map((o) => ({ ...o, valorPrevistoCentavos: o.valorPrevistoCentavos })),
  );

  // Vigente = a versão mais alta da obra entre os itens de planilha (importar a v2 aposenta a v1).
  const obraIds = [...new Set(itens.map((i) => i.obraId))];
  if (obraIds.length > 0) {
    await tx.execute(sql`
      update orcamento o set vigente = (o.versao = m.maxv)
      from (select obra_id, max(versao) as maxv from orcamento
            where origem = 'planilha' and obra_id in (${sql.join(obraIds.map((id) => sql`${id}::uuid`), sql`, `)})
            group by obra_id) m
      where o.obra_id = m.obra_id and o.origem = 'planilha' and o.vigente is distinct from (o.versao = m.maxv)`);
  }
  return total;
}

async function gravarAvanco(tx: Tx, empresaId: string, itens: AvancoImportar[]): Promise<ContagemConjunto> {
  return upsertAvanco(tx, empresaId, itens);
}

export async function confirmarImportacao(ctx: AppContext, id: string): Promise<ResumoImportacao> {
  try {
    return await withScope(ctx, async (tx) => {
      // "Reserva" a importação: só uma confirmação concorrente passa daqui.
      const reservada = await tx
        .update(importacao)
        .set({ status: "processando" })
        .where(and(eq(importacao.id, id), eq(importacao.status, "previa")))
        .returning({ empresaId: importacao.empresaId, arquivoNome: importacao.arquivoNome, payload: importacao.payload, comErro: importacao.comErro, resumo: importacao.resumo });
      const imp = reservada[0];
      if (!imp) throw new ActionError("Esta importação não está mais aguardando confirmação (já foi processada ou cancelada).");

      const p = (imp.payload as PayloadPrevia | null) ?? { lancamentos: [], orcamento: [], avanco: [], avisos: [] };
      const resumo: ResumoImportacao = { errosTotal: (imp.resumo as ResumoImportacao | null)?.errosTotal ?? 0 };

      // Ordem importa só para o resumo; tudo na mesma transação (ou grava tudo, ou nada).
      if (p.orcamento.length) resumo.orcamento = await gravarOrcamento(tx, imp.empresaId, p.orcamento);
      if (p.lancamentos.length) resumo.lancamentos = await gravarLancamentos(tx, imp.empresaId, id, p.lancamentos);
      if (p.avanco.length) resumo.avanco = await gravarAvanco(tx, imp.empresaId, p.avanco);

      await tx
        .update(importacao)
        .set({ status: imp.comErro > 0 ? "concluida_com_erros" : "concluida", payload: null, resumo })
        .where(eq(importacao.id, id));

      const conjuntos = [resumo.lancamentos, resumo.orcamento, resumo.avanco].filter((c): c is ContagemConjunto => !!c);
      const soma = conjuntos.reduce(somarContagens, CONTAGEM_ZERO);
      await registrarAuditoria(tx, ctx, {
        acao: "importar",
        entidade: "importacao",
        entidadeId: id,
        empresaId: imp.empresaId,
        resumo: `Importação confirmada: ${imp.arquivoNome} (${soma.inseridos} novos, ${soma.atualizados} atualizados, ${soma.inalterados} sem mudança)`,
        depois: resumo,
      });
      return resumo;
    });
  } catch (error) {
    if (error instanceof ActionError) throw error;
    // A transação desfez tudo (inclusive a reserva). Registra a falha para o usuário ver.
    const mensagem = error instanceof Error ? error.message : "Falha desconhecida";
    await withScope(ctx, (tx) =>
      tx
        .update(importacao)
        .set({ status: "falhou", payload: null, resumo: { erro: "A gravação falhou e nada foi alterado. Confira os dados e envie o arquivo de novo." } satisfies ResumoImportacao })
        .where(and(eq(importacao.id, id), inArray(importacao.status, ["previa", "processando"]))),
    ).catch(() => undefined);
    console.error("[importacao] falha ao confirmar:", mensagem);
    throw error;
  }
}

export async function cancelarImportacao(ctx: AppContext, id: string): Promise<void> {
  await withScope(ctx, async (tx) => {
    const apagadas = await tx
      .delete(importacao)
      .where(and(eq(importacao.id, id), inArray(importacao.status, ["previa", "falhou"])))
      .returning({ empresaId: importacao.empresaId, arquivoNome: importacao.arquivoNome });
    const imp = apagadas[0];
    if (!imp) throw new ActionError("Só é possível descartar importações aguardando confirmação ou que falharam.");
    await registrarAuditoria(tx, ctx, {
      acao: "excluir",
      entidade: "importacao",
      entidadeId: id,
      empresaId: imp.empresaId,
      resumo: `Importação descartada: ${imp.arquivoNome}`,
    });
  });
}
