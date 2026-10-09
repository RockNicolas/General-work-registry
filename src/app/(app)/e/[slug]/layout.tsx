import type { ReactNode } from "react";
import { empresaDaRota } from "@/features/empresas/rota";

export default async function EmpresaLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await empresaDaRota(slug);
  return children;
}
