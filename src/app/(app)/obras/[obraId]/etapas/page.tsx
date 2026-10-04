import { notFound } from "next/navigation";
import { requireContext } from "@/features/auth/session";
import { EtapasView } from "@/features/etapas/components/etapas-view";
import { listarEtapas } from "@/features/etapas/service";
import { obterObra } from "@/features/obras/queries";

export const metadata = { title: "Etapas — RGO" };

export default async function EtapasPage({ params }: PageProps<"/obras/[obraId]/etapas">) {
  const { obraId } = await params;
  const ctx = await requireContext();
  const obra = await obterObra(ctx, obraId);
  if (!obra) notFound();
  const etapas = await listarEtapas(ctx, obra.id);

  return <EtapasView obraId={obra.id} etapas={etapas} isAdmin={ctx.isAdmin} />;
}
