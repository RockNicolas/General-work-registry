import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { can } from "@/features/auth/policies";
import { requireContext } from "@/features/auth/session";
import { listarEmpresas } from "@/features/empresas/service";
import { urlDaEmpresa } from "@/features/empresas/url";
import { AvancoCurva, AvancoTabela } from "@/features/dashboards/components/avanco-chart";
import { EvolucaoChart } from "@/features/dashboards/components/evolucao-chart";
import { FiltrosForm } from "@/features/dashboards/components/filtros-form";
import { GruposChart } from "@/features/dashboards/components/grupos-chart";
import { KpiCards } from "@/features/dashboards/components/kpi-cards";
import { ObrasComparativoTable } from "@/features/dashboards/components/obras-table";
import { RankingChart } from "@/features/dashboards/components/ranking-chart";
import { Secao } from "@/features/dashboards/components/secoes";
import { VencimentosChart } from "@/features/dashboards/components/vencimentos-chart";
import { filtrosParaParams, resolverFiltros } from "@/features/dashboards/filtros";
import { hojeEmSaoPaulo, rotuloMes } from "@/features/dashboards/periodo";
import { carregarDashboard, opcoesDeFiltro } from "@/features/dashboards/queries";
import { ExportarBotoes } from "@/features/exportacoes/components/exportar-botoes";
import { LANCAMENTO_CLASSE_LABEL } from "@/lib/domain";
import { formatBRL } from "@/lib/money";

export const metadata = { title: "Análises — RGO" };

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type EmpresaDaUrl = { id: string; nome: string; slug: string };

export async function PainelAnalises({
  searchParams,
  empresa,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  /** Quando a página é a URL da empresa, os números ficam presos a ela. */
  empresa?: EmpresaDaUrl;
}) {
  const ctx = await requireContext();
  const bruto = await searchParams;
  const hoje = hojeEmSaoPaulo();
  const filtros = resolverFiltros(Object.fromEntries(Object.entries(bruto).map(([k, v]) => [k, primeiro(v)])), hoje);
  if (empresa) filtros.empresaId = empresa.id;
  const [d, opcoesBrutas] = await Promise.all([carregarDashboard(ctx, filtros, hoje), opcoesDeFiltro(ctx)]);
  const opcoes = empresa
    ? {
        empresas: opcoesBrutas.empresas.filter((e) => e.id === empresa.id),
        obras: opcoesBrutas.obras.filter((o) => o.empresaId === empresa.id),
      }
    : opcoesBrutas;

  const periodo = filtros.de === filtros.ate ? rotuloMes(filtros.de) : `${rotuloMes(filtros.de)} a ${rotuloMes(filtros.ate)}`;
  const ate = rotuloMes(filtros.ate);
  const primeiroNome = ctx.nome.split(" ")[0];

  return (
    <>
      <PageHeader
        title="Análises"
        description={
          empresa
            ? `${empresa.nome}. Endereço /e/${empresa.slug}. Resultado de ${periodo}; acumulados até ${ate}.`
            : `Olá, ${primeiroNome}. Custo, receita e margem das obras que você acompanha. Resultado de ${periodo}; acumulados até ${ate}.`
        }
        actions={can(ctx, "exportar", "relatorio") && opcoes.obras.length > 0 ? <ExportarBotoes rota="/api/exportacoes/painel" params={filtrosParaParams(filtros)} /> : undefined}
      />

      <FiltrosForm filtros={filtros} opcoes={opcoes} action={empresa ? urlDaEmpresa(empresa.slug) : "/dashboard"} />

      {opcoes.obras.length === 0 ? (
        <Alert>
          <AlertTitle>Nenhuma obra para exibir</AlertTitle>
          <AlertDescription>
            {ctx.isAdmin ? (
              <>
                Cadastre uma obra em <Link href={empresa ? urlDaEmpresa(empresa.slug, "obras") : "/obras"} className="underline underline-offset-4">Obras</Link> e importe ou sincronize os dados para ver os indicadores.
              </>
            ) : (
              "Quando houver obras liberadas para você, os indicadores aparecem aqui."
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <KpiCards k={d.kpis} />

          <Secao titulo="Receita, custo e margem por mês" descricao={`Realizados (pagos e recebidos), por competência, de ${periodo}. Só lançamentos operacionais.`}>
            <EvolucaoChart dados={d.evolucao} />
          </Secao>

          <Secao titulo="Obras: orçado × comprometido × incorrido" descricao={`Acumulado até ${ate}. Comprometido = pago + a pagar. Desvio positivo = acima do orçamento vigente. Clique no título da coluna para ordenar.`}>
            <ObrasComparativoTable obras={d.obras} />
          </Secao>

          <Secao titulo="Custo por grupo" descricao={`Quanto do orçamento de cada grupo já está comprometido (materiais, máquinas e equipamentos, mão de obra direta e indireta...). Acumulado até ${ate}.`}>
            <GruposChart grupos={d.grupos} />
          </Secao>

          <div className="grid gap-4 xl:grid-cols-2">
            <Secao titulo="Custo por categoria" descricao={`Custo comprometido por categoria, de ${periodo}.`}>
              <RankingChart fatias={d.categorias} descricao="Custo comprometido por categoria" />
            </Secao>
            <Secao titulo="Custo por etapa" descricao={`Custo comprometido por etapa da obra, de ${periodo}. Lançamentos sem etapa ficam em “Sem etapa”.`}>
              <RankingChart fatias={d.etapas} descricao="Custo comprometido por etapa" />
            </Secao>
          </div>

          <Secao
            titulo="Avanço físico: planejado × realizado"
            descricao={`Percentual acumulado até ${ate}. O planejado é a linha de base cadastrada; o realizado, o último mês informado.`}
          >
            {d.avanco.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum avanço físico informado nos filtros escolhidos.</p>
            ) : (
              <div className="grid gap-4">
                {d.avanco.length === 1 ? (
                  <AvancoCurva obra={d.avanco[0]!} />
                ) : (
                  <p className="text-sm text-muted-foreground">Escolha uma obra no filtro para ver a curva mês a mês.</p>
                )}
                <AvancoTabela obras={d.avanco} />
              </div>
            )}
          </Secao>

          <div className="grid gap-4 xl:grid-cols-2">
            <Secao titulo="Contas a pagar por vencimento" descricao={`A partir de hoje (${hoje.split("-").reverse().join("/")}), por faixa de dias, com e sem título de previsão. Não depende do período.`}>
              <VencimentosChart dados={d.aPagar} titulo="Contas a pagar por faixa de vencimento" />
            </Secao>
            <Secao titulo="Contas a receber por vencimento" descricao="Mesmas faixas, para o que ainda será recebido.">
              <VencimentosChart dados={d.aReceber} titulo="Contas a receber por faixa de vencimento" />
            </Secao>
          </div>

          {d.foraDaMargem.length > 0 && (
            <Secao titulo="Fora da margem" descricao={`Movimentos de caixa de ${periodo} que não entram em custo, receita nem margem.`}>
              <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {d.foraDaMargem.map((f) => (
                  <div key={`${f.classe}-${f.tipo}`} className="flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2">
                    <dt className="text-muted-foreground">
                      {LANCAMENTO_CLASSE_LABEL[f.classe]} ({f.tipo === "receita" ? "entrada" : "saída"})
                    </dt>
                    <dd className="font-medium tabular-nums">{formatBRL(f.valor)}</dd>
                  </div>
                ))}
              </dl>
            </Secao>
          )}

          <details className="rounded-lg border px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">Como os números são calculados</summary>
            <ul className="mt-3 grid gap-1.5 text-muted-foreground">
              <li><strong className="text-foreground">Incorrido</strong>: custo já pago (realizado).</li>
              <li><strong className="text-foreground">Comprometido</strong>: custo pago + custo a pagar.</li>
              <li><strong className="text-foreground">Orçado</strong>: orçamento vigente da obra (versões antigas não contam).</li>
              <li><strong className="text-foreground">Desvio</strong>: comprometido − orçado; positivo = acima do orçamento.</li>
              <li><strong className="text-foreground">Margem realizada</strong>: receita realizada − custo realizado. <strong className="text-foreground">Margem projetada</strong>: (receita realizada + a receber) − comprometido.</li>
              <li>Só lançamentos <em>operacionais</em> entram. Aportes, adiantamentos e devoluções a sócios ficam fora da margem.</li>
              <li>Período: resultado por data de competência, de {periodo}. Acumulados (obras, grupos, avanço): tudo até {ate}.</li>
            </ul>
          </details>
        </>
      )}
    </>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireContext();
  if (!ctx.isAdmin) {
    const minhas = (await listarEmpresas(ctx)).filter((e) => e.ativo);
    if (minhas.length === 1) redirect(urlDaEmpresa(minhas[0]!.slug));
  }
  return <PainelAnalises searchParams={searchParams} />;
}
