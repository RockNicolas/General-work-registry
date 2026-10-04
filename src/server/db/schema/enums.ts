import { pgEnum } from "drizzle-orm/pg-core";
import {
  AVANCO_TIPOS,
  CATEGORIA_GRUPOS,
  ERPS,
  IMPORTACAO_STATUS,
  INTEGRACAO_STATUS,
  LANCAMENTO_CLASSES,
  LANCAMENTO_SITUACOES,
  LANCAMENTO_TIPOS,
  OBRA_STATUS,
  ORIGENS,
  SYNC_GATILHOS,
  SYNC_STATUS,
} from "@/lib/domain";

export const obraStatus = pgEnum("obra_status", OBRA_STATUS);
export const categoriaGrupo = pgEnum("categoria_grupo", CATEGORIA_GRUPOS);
export const lancamentoTipo = pgEnum("lancamento_tipo", LANCAMENTO_TIPOS);
export const lancamentoSituacao = pgEnum("lancamento_situacao", LANCAMENTO_SITUACOES);
export const lancamentoClasse = pgEnum("lancamento_classe", LANCAMENTO_CLASSES);
export const origem = pgEnum("origem", ORIGENS);
export const avancoTipo = pgEnum("avanco_tipo", AVANCO_TIPOS);
export const erp = pgEnum("erp", ERPS);
export const integracaoStatus = pgEnum("integracao_status", INTEGRACAO_STATUS);
export const syncGatilho = pgEnum("sync_gatilho", SYNC_GATILHOS);
export const syncStatus = pgEnum("sync_status", SYNC_STATUS);
export const importacaoStatus = pgEnum("importacao_status", IMPORTACAO_STATUS);
