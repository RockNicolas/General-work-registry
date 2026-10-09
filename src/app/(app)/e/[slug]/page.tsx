import { PainelAnalises } from "@/app/(app)/dashboard/page";
import { empresaDaRota } from "@/features/empresas/rota";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const empresa = await empresaDaRota(slug);
  return { title: `${empresa.nome} — RGO` };
}

export default async function EmpresaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const empresa = await empresaDaRota(slug);
  return <PainelAnalises searchParams={searchParams} empresa={empresa} />;
}
