import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "deve começar com postgres:// ou postgresql://"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "mínimo de 32 caracteres (gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\")"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${details}\nVeja o .env.example.`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Validação preguiçosa: o `next build` não exige o .env, só a execução. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
