"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/redirect";
import { useHydrated } from "@/lib/use-hydrated";

const schema = z.object({
  email: z.email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe a senha"),
});
type Values = z.infer<typeof schema>;

const MENSAGENS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  BANNED_USER: "Este usuário está desativado. Procure o administrador.",
  TOO_MANY_REQUESTS: "Muitas tentativas. Aguarde um instante e tente de novo.",
};

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const hidratado = useHydrated();
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    setErro(null);
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setErro(MENSAGENS[error.code ?? ""] ?? "Não foi possível entrar. Tente novamente.");
      return;
    }
    router.replace(safeNextPath(next));
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Registro Geral de Obra</CardTitle>
        <CardDescription>Entre com seu e-mail e senha.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* method=post: se o envio ocorrer antes do JS carregar, e-mail e senha NÃO vão para a URL. */}
        <form method="post" onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          {erro && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <Button type="submit" disabled={!hidratado || isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
