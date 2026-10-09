import { cache } from "react";
import { notFound } from "next/navigation";
import { requireContext } from "@/features/auth/session";
import { buscarEmpresaPorSlug, type EmpresaRow } from "./service";

/** Uma ida por requisição: o layout e a página pedem a mesma empresa. */
export const empresaDaRota = cache(async (slug: string): Promise<EmpresaRow> => {
  const ctx = await requireContext();
  const empresa = await buscarEmpresaPorSlug(ctx, slug);
  if (!empresa) notFound();
  return empresa;
});
