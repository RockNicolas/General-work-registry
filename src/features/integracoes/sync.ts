import { and, asc, eq, lt, ne, or, sql } from "drizzle-orm";
import { upsertAvanco } from "@/features/avanco/upsert";
import { registrarAuditoria } from "@/features/auditoria/registrar";
import { CATEGORIAS_PADRAO } from "@/features/categorias/service";
import { type LancamentoUpsert, upsertLancamentos } from "@/features/lancamentos/upsert";
import { type OrcamentoUpsert, upsertOrcamento } from "@/features/orcamento/upsert";
import { CATEGORIA_GRUPO_LABEL, type CategoriaGrupo, type LancamentoTipo, type SyncStatus } from "@/lib/domain";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { categoria, etapa, integracao, integracaoObra, sincronizacao } from "@/server/db/schema";
import { classificarClasse, grupoPorNome } from "./classificar";
import { type ConfigIntegracao, lerConfig } from "./config";
import { descriptografar } from "./crypto";
import { listarMeses, somaMeses, hojeISO, janelaDaSincronizacao } from "./erp/periodos";
import { type AmbienteAdapter, type FabricaAdapter, criarAdapter } from "./erp/registro";
import type { ErpAdapter, LoteLancamentos } from "./erp/tipos";
import { mensagemDeErro } from "./sienge/adapter";

export type EscopoSync = { tipo: "incremental" | "historica" };

export type AmbienteSync = {
  fabrica?: FabricaAdapter;
  ambiente?: AmbienteAdapter;
  /** Para teste. */
  hoje?: () => string;
};

export type ResultadoSync =
  | { executada: false; motivo: string }
  | { executada: true; status: SyncStatus; lidos: number; gravados: number; ignorados: number; erros: number };

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Execução "presa" (processo caiu): depois disso outra tentativa pode reassumir. */
const EXECUCAO_PRESA_MINUTOS = 30;
/** Remoção em massa na varredura é tratada como falha parcial do ERP, não como verdade. */
const LIMITE_VARREDURA_MIN = 20;
const LIMITE_VARREDURA_FRACAO = 0.5;

/**
 * Arrays em SQL cru: o Drizzle expande um array JS em lista de parâmetros (record), não em text[].
 * Passamos como JSON e abrimos no banco, o que também escala para milhares de ids.
 */
const listaTexto = (valores: string[]) => sql`(select jsonb_array_elements_text(${JSON.stringify(valores)}::jsonb))`;
const listaUuid = (valores: string[]) => sql`(select x::uuid from jsonb_array_elements_text(${JSON.stringify(valores)}::jsonb) as x)`;

class Diario {
  private itens: { em: string; nivel: "info" | "aviso" | "erro"; msg: string }[] = [];
  private omitidos = 0;

  add(nivel: "info" | "aviso" | "erro", msg: string) {
    if (this.itens.length < 300) this.itens.push({ em: new Date().toISOString(), nivel, msg });
    else this.omitidos++;
  }

  json() {
    return this.omitidos > 0
      ? [...this.itens, { em: new Date().toISOString(), nivel: "aviso" as const, msg: `... e mais ${this.omitidos} mensagem(ns) omitida(s)` }]
      : this.itens;
  }
}

/** Resolve (e cria, se permitido) as categorias do RGO a partir do plano financeiro do ERP. */
class SessaoCategorias {
  private porCodigo = new Map<string, string>();
  private porGrupo = new Map<CategoriaGrupo, string>();
  criadas = 0;

  constructor(
    private readonly db: Db,
    private readonly empresaId: string,
    private readonly config: ConfigIntegracao,
  ) {}

  async resolver(itens: { codigo: string; nome: string; tipo: LancamentoTipo }[]): Promise<Map<string, string>> {
    const faltam = [...new Set(itens.map((i) => i.codigo))].filter((c) => !this.porCodigo.has(c));
    if (faltam.length > 0) {
      const existentes = await this.db
        .select({ id: categoria.id, codigo: categoria.codigoOrigem })
        .from(categoria)
        .where(and(eq(categoria.empresaId, this.empresaId), sql`${categoria.codigoOrigem} in ${faltam}`));
      for (const e of existentes) if (e.codigo) this.porCodigo.set(e.codigo, e.id);
    }
    for (const i of itens) {
      if (this.porCodigo.has(i.codigo)) continue;
      this.porCodigo.set(
        i.codigo,
        this.config.criarCategoriasAutomaticamente ? await this.criar(i.codigo, i.nome, i.tipo) : await this.doGrupo(i.tipo === "receita" ? "receita" : "outros"),
      );
    }
    return this.porCodigo;
  }

  private async criar(codigo: string, nome: string, tipo: LancamentoTipo): Promise<string> {
    const grupo = grupoPorNome(nome, tipo);
    let nomeFinal = nome.trim() || codigo;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const [inserida] = await this.db
        .insert(categoria)
        .values({ empresaId: this.empresaId, nome: nomeFinal, grupo, codigoOrigem: codigo })
        .onConflictDoNothing()
        .returning({ id: categoria.id });
      if (inserida) {
        this.criadas++;
        return inserida.id;
      }
      // Já existe categoria com esse nome: adota se for "livre" (sem código de ERP) ou do mesmo código.
      const [existente] = await this.db
        .select({ id: categoria.id, codigo: categoria.codigoOrigem })
        .from(categoria)
        .where(and(eq(categoria.empresaId, this.empresaId), eq(categoria.nome, nomeFinal)));
      if (existente && (existente.codigo === null || existente.codigo === codigo)) {
        if (existente.codigo === null) await this.db.update(categoria).set({ codigoOrigem: codigo }).where(eq(categoria.id, existente.id));
        return existente.id;
      }
      nomeFinal = `${nome.trim()} (${codigo})`;
    }
    throw new Error(`Não foi possível criar a categoria "${nome}" (${codigo}).`);
  }

  /** Uma categoria qualquer do grupo (cria a padrão do grupo se a empresa ainda não tiver). */
  async doGrupo(grupo: CategoriaGrupo): Promise<string> {
    const cache = this.porGrupo.get(grupo);
    if (cache) return cache;
    const [existente] = await this.db
      .select({ id: categoria.id })
      .from(categoria)
      .where(and(eq(categoria.empresaId, this.empresaId), eq(categoria.grupo, grupo)))
      .orderBy(asc(categoria.createdAt))
      .limit(1);
    let id = existente?.id;
    if (!id) {
      const padrao = CATEGORIAS_PADRAO.find((c) => c.grupo === grupo) ?? { nome: CATEGORIA_GRUPO_LABEL[grupo], grupo };
      const [criada] = await this.db
        .insert(categoria)
        .values({ empresaId: this.empresaId, ...padrao })
        .onConflictDoNothing()
        .returning({ id: categoria.id });
      id =
        criada?.id ??
        (await this.db.select({ id: categoria.id }).from(categoria).where(and(eq(categoria.empresaId, this.empresaId), eq(categoria.nome, padrao.nome))))[0]!.id;
    }
    this.porGrupo.set(grupo, id);
    return id;
  }
}

class SessaoEtapas {
  private cache = new Map<string, string>();
  constructor(private readonly db: Db, private readonly empresaId: string) {}

  async resolver(obraId: string, codigo: string, nome: string | null): Promise<string> {
    const chave = `${obraId}|${codigo}`;
    const cache = this.cache.get(chave);
    if (cache) return cache;
    const buscar = async () =>
      (await this.db.select({ id: etapa.id }).from(etapa).where(and(eq(etapa.obraId, obraId), eq(etapa.codigo, codigo))))[0]?.id;
    let id = await buscar();
    if (!id) {
      await this.db
        .insert(etapa)
        .values({ empresaId: this.empresaId, obraId, codigo, nome: nome ?? `Etapa ${codigo}` })
        .onConflictDoNothing();
      id = await buscar();
    }
    this.cache.set(chave, id!);
    return id!;
  }
}

/**
 * Executa UMA sincronização (linha já criada em `sincronizacao`, status "enfileirada").
 * Pode ser chamada de novo para a mesma linha (reentrega da fila): só a primeira reserva executa.
 * Cada lote mensal é gravado numa transação própria: se cair no meio, o que já foi gravado
 * permanece e a próxima execução completa (tudo é idempotente).
 */
export async function executarSincronizacao(sincronizacaoId: string, amb: AmbienteSync = {}): Promise<ResultadoSync> {
  const db = getDb();
  const hoje = (amb.hoje ?? (() => hojeISO()))();

  // 1) Reserva: só uma execução por linha (e reassume se a anterior ficou presa).
  const [reserva] = await db
    .update(sincronizacao)
    .set({ status: "executando", iniciadaEm: new Date() })
    .where(
      and(
        eq(sincronizacao.id, sincronizacaoId),
        or(
          eq(sincronizacao.status, "enfileirada"),
          and(eq(sincronizacao.status, "executando"), lt(sincronizacao.iniciadaEm, sql`now() - ${EXECUCAO_PRESA_MINUTOS} * interval '1 minute'`)),
        ),
      ),
    )
    .returning();
  if (!reserva) return { executada: false, motivo: "A sincronização não está aguardando execução (já executada ou em andamento)." };

  const diario = new Diario();
  const cont = { lidos: 0, gravados: 0, ignorados: 0, erros: 0 };
  const salvar = async () =>
    db.update(sincronizacao).set({ ...cont, log: diario.json() }).where(eq(sincronizacao.id, sincronizacaoId));

  const [integ] = await db.select().from(integracao).where(eq(integracao.id, reserva.integracaoId));

  try {
    if (!integ) throw new Error("Integração não encontrada.");

    // 2) Outra execução da MESMA integração em andamento? Não disputa o ERP (limites de taxa).
    const [concorrente] = await db
      .select({ id: sincronizacao.id })
      .from(sincronizacao)
      .where(
        and(
          eq(sincronizacao.integracaoId, integ.id),
          eq(sincronizacao.status, "executando"),
          ne(sincronizacao.id, sincronizacaoId),
          sql`${sincronizacao.iniciadaEm} > now() - ${EXECUCAO_PRESA_MINUTOS} * interval '1 minute'`,
        ),
      );
    if (concorrente) throw new Error("Já existe outra sincronização desta integração em andamento. Aguarde terminar.");

    const escopo = (reserva.escopo ?? {}) as Partial<EscopoSync>;
    const tipoJanela = reserva.gatilho === "carga_historica" || escopo.tipo === "historica" ? "historica" : "incremental";
    const config = lerConfig(integ.config);

    const credenciais = JSON.parse(descriptografar(integ.credenciaisEnc ?? "", `integracao:${integ.id}`)) as { usuario: string; senha: string };
    const adapter: ErpAdapter = (amb.fabrica ?? criarAdapter)(
      { erp: integ.erp, endereco: integ.endereco, credenciais, config },
      amb.ambiente ?? { permitirCustom: getEnv().ERP_ALLOW_CUSTOM_BASE_URL },
    );

    // 3) Só sincroniza o que está vinculado a uma obra do RGO.
    const vinculos = await db
      .select({ idOrigem: integracaoObra.idOrigem, obraId: integracaoObra.obraId })
      .from(integracaoObra)
      .where(eq(integracaoObra.integracaoId, integ.id));
    if (vinculos.length === 0) throw new Error("Nenhuma obra do ERP está vinculada a uma obra do RGO. Vincule as obras antes de sincronizar.");
    const obrasMapeadas = new Map(vinculos.map((v) => [v.idOrigem, v.obraId]));
    const idsObrasRgo = [...obrasMapeadas.values()];

    const janela = janelaDaSincronizacao(tipoJanela, config, hoje);
    diario.add("info", `Sincronização ${tipoJanela}: competência de ${janela.inicio} a ${janela.fim}; ${vinculos.length} obra(s) vinculada(s).`);
    await salvar();

    const categorias = new SessaoCategorias(db, integ.empresaId, config);
    const etapas = new SessaoEtapas(db, integ.empresaId);
    const semObra = new Map<string, number>();
    let distorcoes = 0;

    const processarLote = async (lote: LoteLancamentos, prefixo: "out" | "inc") => {
      cont.lidos += lote.lidos;
      for (const aviso of lote.avisos) {
        diario.add("aviso", aviso);
        cont.erros++;
      }

      const mapeados = lote.itens.filter((i) => obrasMapeadas.has(i.obraOrigemId));
      for (const i of lote.itens) if (!obrasMapeadas.has(i.obraOrigemId)) semObra.set(i.obraOrigemId, (semObra.get(i.obraOrigemId) ?? 0) + 1);
      cont.ignorados += lote.itens.length - mapeados.length;
      distorcoes += new Set(mapeados.filter((i) => i.semApropriacaoOrcamento).map((i) => i.grupoOrigem)).size;

      const idsCategoria = await categorias.resolver(mapeados.map((i) => ({ codigo: i.categoria.codigo, nome: i.categoria.nome, tipo: i.tipo })));
      const itens: LancamentoUpsert[] = mapeados.map((i) => ({
        obraId: obrasMapeadas.get(i.obraOrigemId)!,
        etapaId: null,
        categoriaId: idsCategoria.get(i.categoria.codigo)!,
        tipo: i.tipo,
        situacao: i.situacao,
        classe: classificarClasse(i.pistaClasse, i.tipo),
        isPrevisao: i.isPrevisao,
        valorCentavos: i.valorCentavos,
        dataCompetencia: i.dataCompetencia,
        dataVencimento: i.dataVencimento,
        dataLiquidacao: i.dataLiquidacao,
        contraparte: i.contraparte,
        documento: i.documento,
        descricao: i.descricao,
        idOrigem: i.idOrigem,
      }));

      const { contagem, removidos, bloqueada } = await db.transaction(async (tx) => {
        const contagem = itens.length ? await upsertLancamentos(tx, { empresaId: integ.empresaId, origem: "erp", integracaoId: integ.id, importacaoId: null }, itens) : { inseridos: 0, atualizados: 0, inalterados: 0 };
        const varredura = lote.lidos === 0 ? { removidos: 0, bloqueada: false } : await varrer(tx, integ.id, integ.empresaId, prefixo, lote, itens.map((i) => i.idOrigem), idsObrasRgo);
        return { contagem, ...varredura };
      });

      cont.gravados += contagem.inseridos + contagem.atualizados;
      cont.ignorados += contagem.inalterados;
      if (bloqueada) {
        diario.add("aviso", `Período ${lote.periodo.inicio.slice(0, 7)} (${prefixo === "out" ? "custos" : "receitas"}): a varredura de linhas removidas no ERP foi BLOQUEADA por ser grande demais (possível falha parcial do ERP). Nada foi apagado.`);
        cont.erros++;
      } else if (removidos > 0) {
        diario.add("info", `Período ${lote.periodo.inicio.slice(0, 7)} (${prefixo === "out" ? "custos" : "receitas"}): ${removidos} lançamento(s) removido(s) por não existirem mais no ERP.`);
      }
      await salvar();
    };

    for await (const lote of adapter.listarCustos(janela)) await processarLote(lote, "out");
    for await (const lote of adapter.listarReceitas(janela)) await processarLote(lote, "inc");

    if (categorias.criadas > 0) diario.add("info", `${categorias.criadas} categoria(s) criada(s) a partir do plano financeiro do ERP (revise o grupo de cada uma em Categorias).`);
    if (distorcoes > 0) diario.add("aviso", `${distorcoes} parcela(s) de custo sem apropriação ao orçamento da obra (distorção).`);
    if (semObra.size > 0) {
      const top = [...semObra.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} (${n})`).join(", ");
      diario.add("aviso", `Itens ignorados por centro de custo/obra sem vínculo no RGO: ${top}${semObra.size > 8 ? "..." : ""}.`);
    }

    // 4) Orçamento (previsto) e avanço físico, por obra vinculada.
    if (config.sincronizarOrcamento) await sincronizarOrcamento(db, adapter, integ.id, integ.empresaId, obrasMapeadas, categorias, etapas, diario, cont);
    if (config.sincronizarAvanco && adapter.listarAvanco) {
      await sincronizarAvanco(db, adapter, integ.empresaId, obrasMapeadas, config, hoje, diario, cont);
    }

    const status: SyncStatus = cont.erros > 0 ? "concluida_com_erros" : "concluida";
    diario.add("info", `Concluída: ${cont.lidos} lido(s), ${cont.gravados} gravado(s), ${cont.ignorados} sem mudança/ignorado(s), ${cont.erros} problema(s).`);
    await db.transaction(async (tx) => {
      await tx.update(sincronizacao).set({ status, finalizadaEm: new Date(), ...cont, log: diario.json() }).where(eq(sincronizacao.id, sincronizacaoId));
      await tx.update(integracao).set({ ultimaSyncEm: new Date(), status: "ativa", ultimoErro: null }).where(eq(integracao.id, integ.id));
      await registrarAuditoria(tx, { userId: "sistema", nome: "Sistema (sincronização)" }, {
        acao: "sincronizar",
        entidade: "integracao",
        entidadeId: integ.id,
        empresaId: integ.empresaId,
        resumo: `Sincronização ${integ.nome}: ${cont.gravados} gravado(s), ${cont.erros} problema(s)`,
        depois: { ...cont, gatilho: reserva.gatilho, escopo: tipoJanela },
      });
    });
    return { executada: true, status, ...cont };
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    diario.add("erro", mensagem);
    cont.erros++;
    await db
      .update(sincronizacao)
      .set({ status: "falhou", finalizadaEm: new Date(), ...cont, log: diario.json() })
      .where(eq(sincronizacao.id, sincronizacaoId));
    if (integ) await db.update(integracao).set({ status: "erro", ultimoErro: mensagem.slice(0, 500) }).where(eq(integracao.id, integ.id));
    return { executada: true, status: "falhou", ...cont };
  }
}

/**
 * Remove os lançamentos do ERP deste período que não vieram mais na resposta (parcela excluída
 * ou saldo quitado). Só mexe nas obras vinculadas. Se a remoção parecer grande demais, NÃO apaga:
 * pode ser falha parcial do ERP, e o dado histórico vale mais que a limpeza.
 */
async function varrer(tx: Tx, integracaoId: string, empresaId: string, prefixo: "out" | "inc", lote: LoteLancamentos, vigentes: string[], obraIds: string[]) {
  const filtro = sql`empresa_id = ${empresaId} and integracao_id = ${integracaoId}::uuid and origem = 'erp'
    and id_origem like ${`${prefixo}:%`} and data_competencia between ${lote.periodo.inicio}::date and ${lote.periodo.fim}::date
    and obra_id in ${listaUuid(obraIds)}`;

  const [r] = (await tx.execute(sql`
    select count(*)::int as total, count(*) filter (where id_origem not in ${listaTexto(vigentes)})::int as obsoletos
    from lancamento where ${filtro}`)).rows as { total: number; obsoletos: number }[];
  const obsoletos = r?.obsoletos ?? 0;
  if (obsoletos === 0) return { removidos: 0, bloqueada: false };
  if (obsoletos > Math.max(LIMITE_VARREDURA_MIN, (r?.total ?? 0) * LIMITE_VARREDURA_FRACAO)) return { removidos: 0, bloqueada: true };

  const apagados = await tx.execute(sql`delete from lancamento where ${filtro} and id_origem not in ${listaTexto(vigentes)} returning id`);
  return { removidos: apagados.rows.length, bloqueada: false };
}

async function sincronizarOrcamento(
  db: Db,
  adapter: ErpAdapter,
  integracaoId: string,
  empresaId: string,
  obras: Map<string, string>,
  categorias: SessaoCategorias,
  etapas: SessaoEtapas,
  diario: Diario,
  cont: { lidos: number; gravados: number; ignorados: number; erros: number },
) {
  for (const [origemId, obraId] of obras) {
    let linhas;
    try {
      linhas = await adapter.listarOrcamento(origemId);
    } catch (erro) {
      diario.add("aviso", `Obra ${origemId}: orçamento não sincronizado (${mensagemDeErro(erro)}).`);
      cont.erros++;
      continue;
    }
    if (linhas.length === 0) {
      diario.add("info", `Obra ${origemId}: sem orçamento no ERP.`);
      continue;
    }
    cont.lidos += linhas.length;
    const versaoAtual = Math.max(...linhas.map((l) => l.versao));

    const itens: OrcamentoUpsert[] = [];
    for (const l of linhas) {
      itens.push({
        obraId,
        etapaId: l.etapa ? await etapas.resolver(obraId, l.etapa.codigo, l.etapa.nome) : null,
        categoriaId: await categorias.doGrupo(l.grupo),
        versao: l.versao,
        descricao: l.descricao,
        valorPrevistoCentavos: l.valorCentavos,
        idOrigem: `${integracaoId}:${l.idOrigem}`,
      });
    }
    const prefixo = `${integracaoId}:%`;
    const c = await db.transaction(async (tx) => {
      const contagem = await upsertOrcamento(tx, { empresaId, origem: "erp" }, itens);
      // Só a versão atual vale; linhas da versão atual que sumiram do ERP saem.
      await tx.execute(sql`update orcamento set vigente = (versao = ${versaoAtual}) where obra_id = ${obraId}::uuid and origem = 'erp' and id_origem like ${prefixo} and vigente is distinct from (versao = ${versaoAtual})`);
      await tx.execute(sql`delete from orcamento where obra_id = ${obraId}::uuid and origem = 'erp' and id_origem like ${prefixo} and versao = ${versaoAtual} and id_origem not in ${listaTexto(itens.map((i) => i.idOrigem))}`);
      return contagem;
    });
    cont.gravados += c.inseridos + c.atualizados;
    cont.ignorados += c.inalterados;
  }
  diario.add("info", "Orçamento sincronizado.");
}

async function sincronizarAvanco(
  db: Db,
  adapter: ErpAdapter,
  empresaId: string,
  obras: Map<string, string>,
  config: ConfigIntegracao,
  hoje: string,
  diario: Diario,
  cont: { lidos: number; gravados: number; ignorados: number; erros: number },
) {
  const mesAtual = hoje.slice(0, 7);
  // Um mês a mais para trás serve só de referência ("no mês" = diferença entre acumulados).
  const meses = listarMeses(somaMeses(mesAtual, -config.mesesAvanco), mesAtual);
  for (const [origemId, obraId] of obras) {
    try {
      const serie = await adapter.listarAvanco!(origemId, meses);
      if (serie.length === 0) continue;
      cont.lidos += serie.length;
      const c = await db.transaction((tx) =>
        upsertAvanco(tx, empresaId, serie.map((s) => ({ obraId, competencia: s.competencia, tipo: s.tipo, versao: s.versao, pctMesBps: s.pctMesBps, pctAcumBps: s.pctAcumBps }))),
      );
      cont.gravados += c.inseridos + c.atualizados;
      cont.ignorados += c.inalterados;
    } catch (erro) {
      diario.add("aviso", `Obra ${origemId}: avanço físico não sincronizado (${mensagemDeErro(erro)}).`);
      cont.erros++;
    }
  }
  diario.add("info", "Avanço físico sincronizado.");
}
