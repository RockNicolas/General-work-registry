"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

export function SemAcesso({ nome, email }: { nome: string; email: string }) {
  const router = useRouter();

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sem acesso</CardTitle>
          <CardDescription>
            {nome} ({email}) não está vinculado a nenhuma empresa ativa. Procure o administrador do
            sistema para liberar seu acesso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={async () => {
              await authClient.signOut();
              router.replace("/login");
              router.refresh();
            }}
          >
            Sair
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
