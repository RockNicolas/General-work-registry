/** Endereço do administrador: empresas, análises do conjunto e atalho para o painel de cada uma. */
export const URL_ADMIN = "/a";

/** Caminho público da empresa. A raiz é o painel de análises. */
export function urlDaEmpresa(slug: string, parte?: "obras" | "importacoes" | "integracao"): string {
  const base = `/e/${slug}`;
  return parte ? `${base}/${parte}` : base;
}
