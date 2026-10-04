import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar — RGO" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </main>
  );
}
