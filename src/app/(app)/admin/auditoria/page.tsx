import { PageHeader } from "@/components/page-header";
import { AuditoriaTable } from "@/features/auditoria/components/auditoria-table";
import { LIMITE_AUDITORIA, listarAuditoria } from "@/features/auditoria/service";
import { requireAdmin } from "@/features/auth/session";

export const metadata = { title: "Auditoria — RGO" };

export default async function AuditoriaPage() {
  const ctx = await requireAdmin();
  const eventos = await listarAuditoria(ctx);

  return (
    <>
      <PageHeader
        title="Auditoria"
        description={`Quem alterou o quê e quando. Mostra os ${LIMITE_AUDITORIA} eventos mais recentes; o histórico é imutável.`}
      />
      <AuditoriaTable data={eventos} />
    </>
  );
}
