import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, organization } from "better-auth/plugins";
import { ac, orgRoles } from "@/features/auth/access";
import { getDb, type Database } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { getEnv } from "@/server/env";

export function createAuth(db: Database) {
  const env = getEnv();

  return betterAuth({
    appName: "RGO",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      // Sem cadastro público: contas são criadas pelo Administrador.
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    // Quem sai de uma empresa pela API perderia o acesso sem o Administrador saber.
    disabledPaths: ["/organization/leave"],
    plugins: [
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
      organization({
        ac,
        roles: orgRoles,
        creatorRole: "empresa",
        allowUserToCreateOrganization: false,
        schema: {
          organization: {
            additionalFields: {
              cnpj: { type: "string", required: false },
              razaoSocial: { type: "string", required: false },
              ativo: { type: "boolean", required: false, defaultValue: true },
            },
          },
        },
      }),
      // Precisa ser o último: grava os cookies de sessão quando usado em Server Actions.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __rgoAuth?: Auth };

/** Instância única e preguiçosa (não exige env durante o `next build`). */
export function getAuth(): Auth {
  globalForAuth.__rgoAuth ??= createAuth(getDb());
  return globalForAuth.__rgoAuth;
}
