import { notFound } from "next/navigation";
import { requireContext } from "@/features/auth/session";
import { listarCategorias } from "@/features/categorias/service";
import { listarEtapas } from "@/features/etapas/service";
import { obterObra } from "@/features/obras/queries";
import { OrcamentoView } from "@/features/orcamento/components/orcamento-view";
import { listarOrcamento } from "@/features/orcamento/service";

export const metadata = { title: "Orçamento — RGO" };

export default async function OrcamentoPage({ params }: PageProps<"/obras/[obraId]/orcamento">) {
  const { obraId } = await params;
  const ctx = await requireContext();
  const obra = await obterObra(ctx, obraId);
  if (!obra) notFound();

  const [itens, etapas, categorias] = await Promise.all([
    listarOrcamento(ctx, obra.id),
    listarEtapas(ctx, obra.id),
    listarCategorias(ctx, obra.empresaId),
  ]);

  return (
    <OrcamentoView
      obraId={obra.id}
      itens={itens}
      etapas={etapas.map((e) => ({ id: e.id, label: `${e.codigo} — ${e.nome}` }))}
      categorias={categorias.map((c) => ({ id: c.id, label: c.nome }))}
      isAdmin={ctx.isAdmin}
    />
  );
}
