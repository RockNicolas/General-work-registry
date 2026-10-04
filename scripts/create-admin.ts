import { upsertUsuarioCredencial } from "@/server/auth-users";

/**
 * Cria o primeiro Administrador (ou promove um usuário existente).
 *   pnpm admin:create --email voce@empresa.com --nome "Seu Nome" --senha "SenhaForte123"
 * Também aceita ADMIN_EMAIL, ADMIN_NAME e ADMIN_PASSWORD no ambiente.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    // sem .env: usa o ambiente do processo
  }

  const email = arg("email") ?? process.env.ADMIN_EMAIL;
  const name = arg("nome") ?? process.env.ADMIN_NAME ?? "Administrador";
  const password = arg("senha") ?? process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Uso: pnpm admin:create --email <email> --nome "<nome>" --senha "<senha>"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("A senha deve ter pelo menos 8 caracteres.");
    process.exit(1);
  }

  const { id, criado } = await upsertUsuarioCredencial({ email, name, password, role: "admin" });
  console.log(criado ? `Administrador criado: ${email} (${id})` : `Usuário já existia; agora é administrador: ${email}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Falha ao criar administrador:", error instanceof Error ? error.message : error);
  process.exit(1);
});
