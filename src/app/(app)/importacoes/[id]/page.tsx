import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/features/auth/session";
import { ImportacaoDetalhe } from "@/features/importacoes/components/importacao-detalhe";
import { obterImportacao } from "@/features/importacoes/service";

export const metadata = { title: "Importação — RGO" };

export default async function ImportacaoPage({ params }: PageProps<"/importacoes/[id]">) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const detalhe = await obterImportacao(ctx, id);
  if (!detalhe) notFound();

  return (
    <>
      <Link href="/importacoes" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />
        Importações
      </Link>
      <PageHeader title={detalhe.arquivoNome} />
      <ImportacaoDetalhe d={detalhe} />
    </>
  );
}
