import Link from "next/link";
import { PainelAnalises } from "@/app/(app)/dashboard/page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/features/auth/session";
import { listarEmpresas } from "@/features/empresas/service";
import { URL_ADMIN, urlDaEmpresa } from "@/features/empresas/url";

export const metadata = { title: "Administração — RGO" };

async function ListaEmpresas() {
  const ctx = await requireAdmin();
  const empresas = await listarEmpresas(ctx);

  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-medium">Empresas</h2>
      {empresas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma empresa cadastrada. O cadastro fica em <Link href="/admin/empresas" className="underline underline-offset-4">Empresas</Link>.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {empresas.map((empresa) => (
            <li key={empresa.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="grid min-w-0 gap-0.5">
                <Link href={urlDaEmpresa(empresa.slug)} className="truncate font-medium underline-offset-4 hover:underline">
                  {empresa.nome}
                </Link>
                <span className="truncate font-mono text-xs text-muted-foreground">{urlDaEmpresa(empresa.slug)}</span>
                <span className="text-xs text-muted-foreground">
                  {empresa.totalObras} {empresa.totalObras === 1 ? "obra" : "obras"}
                  {empresa.ativo ? "" : " · inativa"}
                </span>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={urlDaEmpresa(empresa.slug)}>Abrir painel</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdministracaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  return (
    <>
      <PageHeader
        title="Administração"
        description="Endereço /a. Daqui você vê todas as empresas, analisa o conjunto e abre o painel de cada uma com o cadastro, a importação e a integração."
      />
      <ListaEmpresas />
      <PainelAnalises searchParams={searchParams} action={URL_ADMIN} secao />
    </>
  );
}
