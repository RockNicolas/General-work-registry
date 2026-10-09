import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  heading = "h1",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** h2 quando o bloco entra dentro de outra página, como as análises em /a. */
  heading?: "h1" | "h2";
}) {
  const Titulo = heading;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1">
        <Titulo className={heading === "h1" ? "text-2xl font-semibold tracking-tight" : "text-lg font-medium"}>{title}</Titulo>
        {description && <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
