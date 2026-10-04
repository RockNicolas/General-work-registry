import type { TenantScope } from "@/server/db/scope";

export type Perfil = "admin" | "empresa" | "cliente" | "sem_acesso";

export type AppContext = TenantScope & {
  userId: string;
  nome: string;
  email: string;
  perfil: Perfil;
};

export type ContextInput = {
  user: { id: string; name: string; email: string; role?: string | null };
  /** Vínculos do usuário com empresas ativas (member.role: "empresa" | "cliente"). */
  memberships: { organizationId: string; role: string }[];
  /** Obras liberadas (obra_acesso). */
  acessos: { obraId: string; empresaId: string }[];
};

function roles(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

const unique = (values: string[]) => [...new Set(values)];

/** Monta o contexto de acesso a partir dos dados já carregados do banco. Função pura. */
export function buildContext({ user, memberships, acessos }: ContextInput): AppContext {
  const isAdmin = roles(user.role).includes("admin");

  const empresaIds = unique(
    memberships.filter((m) => roles(m.role).includes("empresa")).map((m) => m.organizationId),
  );
  const clienteEmpresaIds = unique(
    memberships.filter((m) => roles(m.role).includes("cliente")).map((m) => m.organizationId),
  );
  // Só vale a liberação de obra se o usuário ainda for cliente daquela empresa.
  const obraIds = unique(
    acessos.filter((a) => clienteEmpresaIds.includes(a.empresaId)).map((a) => a.obraId),
  );

  const perfil: Perfil = isAdmin
    ? "admin"
    : empresaIds.length > 0
      ? "empresa"
      : clienteEmpresaIds.length > 0
        ? "cliente"
        : "sem_acesso";

  return {
    userId: user.id,
    nome: user.name,
    email: user.email,
    perfil,
    isAdmin,
    empresaIds,
    membroEmpresaIds: unique([...empresaIds, ...clienteEmpresaIds]),
    obraIds,
  };
}
