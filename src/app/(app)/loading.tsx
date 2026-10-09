"use client";

import { usePathname } from "next/navigation";
import { tituloDaRota } from "@/components/layout/nav";
import { Skeleton } from "@/components/ui/skeleton";

/** A rota abre na hora. Os dados do banco entram depois, no lugar deste esboço. */
export default function CarregandoRota() {
  const titulo = tituloDaRota(usePathname());

  return (
    <div className="grid gap-4" aria-busy="true" aria-live="polite">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
