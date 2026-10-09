import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/features/auth/session";
import { listarEmpresas } from "@/features/empresas/service";
import { ObraFormDialog } from "@/features/obras/components/obra-form-dialog";
import { ObraStatusBadge } from "@/features/obras/components/obra-status-badge";
import { obterObra } from "@/features/obras/queries";
import { ObraTabs } from "./obra-tabs";

export default async function ObraLayout({ children, params }: LayoutProps<"/obras/[obraId]">) {
  const { obraId } = await params;
  const ctx = await requireContext();
  const [obra, empresasAdmin] = await Promise.all([
    obterObra(ctx, obraId),
    ctx.isAdmin ? listarEmpresas(ctx) : Promise.resolve(null),
  ]);
  if (!obra) notFound();

  const empresas = empresasAdmin
    ? empresasAdmin.map((e) => ({ id: e.id, nome: e.nome }))
    : [{ id: obra.empresaId, nome: obra.empresaNome }];

  return (
    <>
      <div className="grid gap-3">
        <Link href="/obras" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          Obras
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {obra.codigo} — {obra.nome}
              </h1>
              <ObraStatusBadge status={obra.status} />
            </div>
            <p className="text-sm text-muted-foreground">{obra.empresaNome}</p>
          </div>
          {ctx.isAdmin && <ObraFormDialog obra={obra} empresas={empresas} triggerVariant="button" />}
        </div>
        <ObraTabs obraId={obra.id} />
      </div>
      {children}
    </>
  );
}
