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
  /** Chave AES-256 (32 bytes em base64) que protege as credenciais de ERP. Obrigatória só ao usar integrações. */
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "deve ser 32 bytes em base64 (gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\")")
    .optional(),
  /** Só dev/teste: permite informar uma URL base completa no lugar do subdomínio do ERP (evita SSRF em produção). */
  ERP_ALLOW_CUSTOM_BASE_URL: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
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
