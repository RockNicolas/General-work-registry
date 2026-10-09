/** Caminho público da empresa. A raiz é o painel de análises. */
export function urlDaEmpresa(slug: string, parte?: "obras" | "importacoes" | "integracao"): string {
  const base = `/e/${slug}`;
  return parte ? `${base}/${parte}` : base;
}
