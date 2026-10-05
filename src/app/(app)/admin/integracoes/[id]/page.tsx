import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireAdmin } from "@/features/auth/session";
import { listarEmpresas } from "@/features/empresas/service";
import { AGENDAMENTOS } from "@/features/integracoes/config";
import { ExecucoesCard } from "@/features/integracoes/components/execucoes-card";
import { IntegracaoAcoes } from "@/features/integracoes/components/integracao-acoes";
import { IntegracaoFormDialog } from "@/features/integracoes/components/integracao-form-dialog";
import { IntegracaoStatusBadge } from "@/features/integracoes/components/status-badge";
import { VinculosCard } from "@/features/integracoes/components/vinculos-card";
import { WebhookCard } from "@/features/integracoes/components/webhook-card";
import { obterIntegracao } from "@/features/integracoes/service";
import { listarObras } from "@/features/obras/service";
import { formatDateTimeBR } from "@/lib/dates";
import { ERP_LABEL } from "@/lib/domain";

export const metadata = { title: "Integração — RGO" };

export default async function IntegracaoPage({ params }: PageProps<"/admin/integracoes/[id]">) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const d = await obterIntegracao(ctx, id);
  if (!d) notFound();
  const [empresas, obras] = await Promise.all([listarEmpresas(ctx), listarObras(ctx)]);

  const agendamento = AGENDAMENTOS.find((a) => a.value === d.agendamento)?.label ?? "Somente manual";
  const obrasDaEmpresa = obras.filter((o) => o.empresaId === d.empresaId).map((o) => ({ id: o.id, codigo: o.codigo, nome: o.nome }));

  return (
    <>
      <Link href="/admin/integracoes" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />
        Integrações
      </Link>
      <PageHeader
        title={d.nome}
        actions={<IntegracaoFormDialog integracao={d} usuarioAtual={d.usuarioAtual} empresas={empresas.filter((e) => e.ativo || e.id === d.empresaId).map((e) => ({ id: e.id, nome: e.nome }))} />}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <IntegracaoStatusBadge status={d.status} />
        <span>
          {d.empresaNome} · {ERP_LABEL[d.erp]} · {d.endereco}
        </span>
        <span>Sincronização: {agendamento}</span>
        <span>Última: {d.ultimaSyncEm ? formatDateTimeBR(new Date(d.ultimaSyncEm)) : "nunca"}</span>
      </div>

      {d.status === "erro" && d.ultimoErro && (
        <Alert variant="destructive">
          <AlertTitle>A última tentativa falhou</AlertTitle>
          <AlertDescription>{d.ultimoErro}</AlertDescription>
        </Alert>
      )}
      {d.status === "pausada" && (
        <Alert>
          <AlertTitle>Integração pausada</AlertTitle>
          <AlertDescription>
            {d.sincronizavel
              ? "Teste a conexão para ativá-la. Enquanto estiver pausada, nenhuma sincronização (manual, agendada ou por webhook) é executada."
              : `A sincronização com ${ERP_LABEL[d.erp]} ainda não está disponível: aguardando a documentação da API.`}
          </AlertDescription>
        </Alert>
      )}

      <IntegracaoAcoes d={d} />

      <VinculosCard integracaoId={d.id} vinculos={d.vinculos} obrasRgo={obrasDaEmpresa} />
      <WebhookCard integracaoId={d.id} url={d.urlWebhook} ativo={d.webhookAtivo} eventos={d.config.eventosWebhook} podeRegistrar={d.erp === "sienge"} />
      <ExecucoesCard execucoes={d.execucoes} />
    </>
  );
}
