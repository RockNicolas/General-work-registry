import Link from "next/link";
import { notFound } from "next/navigation";
import { NativeSelect } from "@/components/form/native-select";
import { PaginationLinks } from "@/components/pagination-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { can } from "@/features/auth/policies";
import { requireContext } from "@/features/auth/session";
import { listarCategorias } from "@/features/categorias/service";
import { listarEtapas } from "@/features/etapas/service";
import { ExportarBotoes } from "@/features/exportacoes/components/exportar-botoes";
import { LancamentoFormDialog } from "@/features/lancamentos/components/lancamento-form-dialog";
import { LancamentosTable } from "@/features/lancamentos/components/lancamentos-table";
import { filtrosLancamentoSchema } from "@/features/lancamentos/schema";
import { listarLancamentos } from "@/features/lancamentos/service";
import { obterObra } from "@/features/obras/queries";
import {
  LANCAMENTO_CLASSES,
  LANCAMENTO_CLASSE_LABEL,
  LANCAMENTO_SITUACOES,
  LANCAMENTO_SITUACAO_LABEL,
  LANCAMENTO_TIPOS,
  LANCAMENTO_TIPO_LABEL,
} from "@/lib/domain";
import { formatBRL } from "@/lib/money";

export const metadata = { title: "Lançamentos — RGO" };

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LancamentosPage({
  params,
  searchParams,
}: PageProps<"/obras/[obraId]/lancamentos">) {
  const { obraId } = await params;
  const bruto = await searchParams;
  const ctx = await requireContext();
  const obra = await obterObra(ctx, obraId);
  if (!obra) notFound();

  const filtros = filtrosLancamentoSchema.parse(Object.fromEntries(Object.entries(bruto).map(([k, v]) => [k, primeiro(v)])));
  const [pagina, etapas, categorias] = await Promise.all([
    listarLancamentos(ctx, obra.id, filtros),
    listarEtapas(ctx, obra.id),
    listarCategorias(ctx, obra.empresaId),
  ]);

  const base = `/obras/${obra.id}/lancamentos`;
  const opcoesEtapas = etapas.map((e) => ({ id: e.id, label: `${e.codigo} — ${e.nome}` }));
  const opcoesCategorias = categorias.map((c) => ({ id: c.id, label: c.nome }));
  const todos = { value: "", label: "Todos" };
  const filtrosAtivos = Boolean(filtros.tipo || filtros.situacao || filtros.classe || filtros.de || filtros.ate || filtros.q);

  return (
    <div className="grid gap-4">
      <form method="get" action={base} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <NativeSelect
          name="tipo"
          label="Tipo"
          defaultValue={filtros.tipo}
          options={[todos, ...LANCAMENTO_TIPOS.map((t) => ({ value: t, label: LANCAMENTO_TIPO_LABEL[t] }))]}
        />
        <NativeSelect
          name="situacao"
          label="Situação"
          defaultValue={filtros.situacao}
          options={[todos, ...LANCAMENTO_SITUACOES.map((s) => ({ value: s, label: LANCAMENTO_SITUACAO_LABEL[s] }))]}
        />
        <NativeSelect
          name="classe"
          label="Classe"
          defaultValue={filtros.classe}
          options={[todos, ...LANCAMENTO_CLASSES.map((c) => ({ value: c, label: LANCAMENTO_CLASSE_LABEL[c] }))]}
        />
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Competência de
          <Input type="date" name="de" defaultValue={filtros.de ?? ""} className="w-40" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          até
          <Input type="date" name="ate" defaultValue={filtros.ate ?? ""} className="w-40" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Buscar
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Fornecedor, NF, descrição" className="w-56" />
        </label>
        <Button type="submit">Filtrar</Button>
        {filtrosAtivos && (
          <Button asChild variant="ghost">
            <Link href={base}>Limpar</Link>
          </Button>
        )}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Custos: <strong className="text-foreground tabular-nums">{formatBRL(pagina.somaCustoCentavos)}</strong> · Receitas:{" "}
          <strong className="text-foreground tabular-nums">{formatBRL(pagina.somaReceitaCentavos)}</strong>
          {filtrosAtivos && " (com os filtros aplicados)"}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {can(ctx, "exportar", "relatorio") && (
            <ExportarBotoes
              rota="/api/exportacoes/lancamentos"
              params={{ obra: obra.id, tipo: filtros.tipo, situacao: filtros.situacao, classe: filtros.classe, de: filtros.de, ate: filtros.ate, q: filtros.q }}
            />
          )}
          {ctx.isAdmin && <LancamentoFormDialog obraId={obra.id} etapas={opcoesEtapas} categorias={opcoesCategorias} />}
        </div>
      </div>

      <LancamentosTable obraId={obra.id} rows={pagina.rows} etapas={opcoesEtapas} categorias={opcoesCategorias} isAdmin={ctx.isAdmin} />

      <PaginationLinks
        basePath={base}
        params={{ tipo: filtros.tipo, situacao: filtros.situacao, classe: filtros.classe, de: filtros.de, ate: filtros.ate, q: filtros.q }}
        pagina={pagina.pagina}
        totalPaginas={pagina.totalPaginas}
        total={pagina.total}
      />
    </div>
  );
}
