import type { CategoriaGrupo, LancamentoClasse, LancamentoTipo } from "@/lib/domain";

/**
 * Regras (heurísticas por nome) para o que o ERP não diz explicitamente. Ficam isoladas aqui
 * para serem revisadas; o administrador sempre pode reclassificar o grupo de uma categoria na
 * tela de Categorias, e a classe de lançamentos específicos no ERP/planilha.
 */

const sem = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Classe do lançamento: só "operacional" entra na margem. Aporte e adiantamento de cliente são
 * entradas de caixa (receita); devolução/retirada a sócios é saída (custo).
 */
export function classificarClasse(pista: string, tipo: LancamentoTipo): LancamentoClasse {
  const t = sem(pista);
  if (tipo === "receita") {
    if (/\baporte/.test(t)) return "aporte";
    if (/adiantamento/.test(t)) return "adiantamento";
  } else if (/devolucao.{0,25}(socio|acionista)|retirada.{0,15}socio|distribuicao de lucro|pro.?labore/.test(t)) {
    return "devolucao_socio";
  }
  return "operacional";
}

/** Grupo de custo sugerido para uma categoria nova vinda do ERP, pelo nome do plano financeiro. */
export function grupoPorNome(nome: string, tipo: LancamentoTipo): CategoriaGrupo {
  if (tipo === "receita") return "receita";
  const t = sem(nome);
  if (/mao.?de.?obra.*indiret|indiret.*mao.?de.?obra|administracao da obra|engenharia e apoio/.test(t)) return "mao_obra_indireta";
  if (/mao.?de.?obra|salario|folha|encargos|ferias|13o|decimo terceiro|fgts|inss|empreitada de mao/.test(t)) return "mao_obra_direta";
  if (/equipamento|maquina|locacao de|andaime|grua|betoneira|ferramenta/.test(t)) return "maquinas_equipamentos";
  if (/material|materiais|cimento|concreto|aco\b|areia|brita|tijolo|bloco|madeira|tinta|eletric.*material|hidraul.*material|combustivel/.test(t)) return "material";
  if (/servico|terceir|empreit|projeto|consultoria|subempreit|topografia|sondagem/.test(t)) return "servicos";
  return "outros";
}
