type PgErrorLike = { code?: string; constraint?: string; detail?: string; message?: string };

/** O drizzle embrulha o erro do pg em `cause`; o código SQLSTATE está no erro de baixo. */
function pgError(error: unknown): PgErrorLike | null {
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i++) {
    const candidate = current as PgErrorLike & { cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) return candidate;
    current = candidate.cause;
  }
  return null;
}

const UNIQUE: Record<string, string> = {
  obra_empresa_codigo_uidx: "Já existe uma obra com este código nesta empresa.",
  categoria_empresa_nome_uidx: "Já existe uma categoria com este nome nesta empresa.",
  etapa_obra_codigo_uidx: "Já existe uma etapa com este código nesta obra.",
  organization_slug_unique: "Já existe uma empresa com este nome.",
  organization_slug_uidx: "Já existe uma empresa com este nome.",
  user_email_unique: "Este e-mail já está cadastrado.",
  avanco_unico_uidx: "Já existe avanço lançado para esta competência, tipo e versão.",
  integracao_empresa_nome_uidx: "Já existe uma integração com este nome nesta empresa.",
  lancamento_origem_uidx: "Este lançamento já existe (mesma origem e identificador).",
  orcamento_origem_uidx: "Este item de orçamento já existe (mesma origem e identificador).",
};

const CHECK: Record<string, string> = {
  lancamento_valor_nao_zero: "O valor do lançamento não pode ser zero.",
  orcamento_valor_nao_negativo: "O valor do orçamento não pode ser negativo.",
  avanco_pct_mes_faixa: "O percentual do mês deve estar entre 0% e 100%.",
  avanco_pct_acum_faixa: "O percentual acumulado deve estar entre 0% e 100%.",
  avanco_competencia_dia_1: "A competência deve ser o primeiro dia do mês.",
};

/**
 * Traduz erros conhecidos do Postgres em mensagens para o usuário (pt-BR).
 * Retorna null para erros inesperados: esses devem ser logados e mostrados de forma genérica.
 */
export function friendlyDbError(error: unknown): string | null {
  const e = pgError(error);
  if (!e) return null;

  switch (e.code) {
    case "23505":
      return (e.constraint && UNIQUE[e.constraint]) || "Já existe um registro com estes dados.";
    case "23503":
      return e.detail?.includes("is still referenced")
        ? "Não é possível excluir: existem registros vinculados a este item."
        : "Referência inválida: o item relacionado não existe ou pertence a outra empresa/obra.";
    case "23514":
      return (e.constraint && CHECK[e.constraint]) || "Valor fora do permitido.";
    case "42501":
      return "Sem permissão para esta operação.";
    default:
      return null;
  }
}
