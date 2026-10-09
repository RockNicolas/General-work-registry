import { PageHeader } from "@/components/page-header";
import { can } from "@/features/auth/policies";
import { requirePode } from "@/features/auth/session";
import { empresaDaRota } from "@/features/empresas/rota";
import { IntegracaoFormDialog } from "@/features/integracoes/components/integracao-form-dialog";
import { IntegracoesTable } from "@/features/integracoes/components/integracoes-table";
import { listarIntegracoes } from "@/features/integracoes/service";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const empresa = await empresaDaRota((await params).slug);
  return { title: `Integração · ${empresa.nome} — RGO` };
}

export default async function IntegracaoDaEmpresaPage({ params }: { params: Promise<{ slug: string }> }) {
  const empresa = await empresaDaRota((await params).slug);
  const ctx = await requirePode("ver", "integracao");
  const integracoes = (await listarIntegracoes(ctx)).filter((i) => i.empresaId === empresa.id);

  return (
    <>
      <PageHeader
        title="Integração"
        description={`${empresa.nome}. Endereço /e/${empresa.slug}/integracao.`}
        actions={can(ctx, "criar", "integracao") ? <IntegracaoFormDialog empresas={[{ id: empresa.id, nome: empresa.nome }]} /> : undefined}
      />
      <IntegracoesTable data={integracoes} />
    </>
  );
}
