import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Paginação por links (servidor), preservando os demais parâmetros da URL. */
export function PaginationLinks({
  basePath,
  params,
  pagina,
  totalPaginas,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  pagina: number;
  totalPaginas: number;
  total: number;
}) {
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "pagina") qs.set(k, v);
    if (p > 1) qs.set("pagina", String(p));
    const texto = qs.toString();
    return texto ? `${basePath}?${texto}` : basePath;
  };

  return (
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        {total} registro(s) · página {pagina} de {totalPaginas}
      </span>
      <div className="flex gap-2">
        {pagina > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(pagina - 1)}>Anterior</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Anterior
          </Button>
        )}
        {pagina < totalPaginas ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(pagina + 1)}>Próxima</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Próxima
          </Button>
        )}
      </div>
    </div>
  );
}
