import { notFound } from "next/navigation";
import { compararAvanco } from "@/features/avanco/comparativo";
import { AvancoView } from "@/features/avanco/components/avanco-view";
import { listarAvanco } from "@/features/avanco/service";
import { requireContext } from "@/features/auth/session";
import { obterObra } from "@/features/obras/queries";

export const metadata = { title: "Avanço físico — RGO" };

export default async function AvancoPage({ params }: PageProps<"/obras/[obraId]/avanco">) {
  const { obraId } = await params;
  const ctx = await requireContext();
  const [obra, linhas] = await Promise.all([obterObra(ctx, obraId), listarAvanco(ctx, obraId)]);
  if (!obra) notFound();
  return <AvancoView obraId={obra.id} linhas={linhas} comparativo={compararAvanco(linhas)} isAdmin={ctx.isAdmin} />;
}
