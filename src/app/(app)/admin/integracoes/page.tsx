import { PageHeader } from "@/components/page-header";
import { requirePode } from "@/features/auth/session";
import { listarEmpresas } from "@/features/empresas/service";
import { IntegracaoFormDialog } from "@/features/integracoes/components/integracao-form-dialog";
import { IntegracoesTable } from "@/features/integracoes/components/integracoes-table";
import { listarIntegracoes } from "@/features/integracoes/service";

export const metadata = { title: "Integrações — RGO" };

export default async function IntegracoesPage() {
  const ctx = await requirePode("ver", "integracao");
  const [integracoes, empresas] = await Promise.all([listarIntegracoes(ctx), listarEmpresas(ctx)]);

  return (
    <>
      <PageHeader
        title="Integrações"
        description="Conecte o ERP de cada empresa (Sienge) para trazer custos, receitas, orçamento e avanço físico automaticamente. Os dados chegam pelo mesmo caminho das planilhas e podem ser reprocessados sem duplicar."
        actions={<IntegracaoFormDialog empresas={empresas.filter((e) => e.ativo).map((e) => ({ id: e.id, nome: e.nome }))} />}
      />
      <IntegracoesTable data={integracoes} />
    </>
  );
}
