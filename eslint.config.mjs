import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Consulta de domínio SÓ por withScope() (isolamento por empresa/RLS). O cliente cru do banco
    // (conexão do dono, ignora RLS) fica restrito a auth, sync de ERP e infraestrutura.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}"],
    ignores: [
      "src/features/auth/**",
      "src/features/integracoes/**",
      "src/app/api/health/**",
      "**/*.test.ts",
      "**/*.int.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/db/client",
              message:
                "Use withScope() de @/server/db/scope: o cliente cru ignora o isolamento por empresa (RLS).",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
