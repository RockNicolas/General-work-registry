import Link from "next/link";
import { NativeSelect } from "@/components/form/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIA_GRUPOS, CATEGORIA_GRUPO_LABEL } from "@/lib/domain";
import type { FiltrosDashboard } from "../filtros";

type Opcoes = {
  empresas: { id: string; nome: string }[];
  obras: { id: string; codigo: string; nome: string; empresaNome: string }[];
};

/**
 * Filtros por GET: funcionam sem JavaScript e deixam a URL compartilhável. As opções vêm só do que
 * o usuário enxerga. O período mexe no resultado (KPIs, evolução, distribuição); o fim do período
 * também é a data-limite dos acumulados.
 */
export function FiltrosForm({ filtros, opcoes, action = "/dashboard" }: { filtros: FiltrosDashboard; opcoes: Opcoes; action?: string }) {
  const varias = opcoes.empresas.length > 1;
  const todos = (rotulo: string) => ({ value: "", label: rotulo });
  const padrao = !filtros.empresaId && !filtros.obraId && !filtros.grupo;

  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3 rounded-lg border p-3" aria-label="Filtros do painel">
      {varias && (
        <NativeSelect name="empresa" label="Empresa" defaultValue={filtros.empresaId} options={[todos("Todas as empresas"), ...opcoes.empresas.map((e) => ({ value: e.id, label: e.nome }))]} />
      )}
      <NativeSelect
        name="obra"
        label="Obra"
        defaultValue={filtros.obraId}
        className="max-w-72"
        options={[todos("Todas as obras"), ...opcoes.obras.map((o) => ({ value: o.id, label: `${varias ? `${o.empresaNome} · ` : ""}${o.codigo} — ${o.nome}` }))]}
      />
      <NativeSelect
        name="grupo"
        label="Grupo de custo"
        defaultValue={filtros.grupo}
        options={[todos("Todos os grupos"), ...CATEGORIA_GRUPOS.filter((g) => g !== "receita").map((g) => ({ value: g, label: CATEGORIA_GRUPO_LABEL[g] }))]}
      />
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Período de
        <Input type="month" name="de" defaultValue={filtros.de} className="w-40" required />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        até
        <Input type="month" name="ate" defaultValue={filtros.ate} className="w-40" required />
      </label>
      <Button type="submit">Aplicar</Button>
      {!padrao && (
        <Button asChild variant="ghost">
          <Link href={action}>Limpar</Link>
        </Button>
      )}
    </form>
  );
}
