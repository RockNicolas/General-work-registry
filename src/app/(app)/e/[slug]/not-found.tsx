import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function EmpresaNaoEncontrada() {
  return (
    <div className="grid gap-3 py-12 text-center">
      <h1 className="text-xl font-semibold">Empresa não encontrada</h1>
      <p className="text-sm text-muted-foreground">Esse endereço não existe ou você não tem acesso a esta empresa.</p>
      <div>
        <Button asChild variant="outline">
          <Link href="/dashboard">Voltar ao painel</Link>
        </Button>
      </div>
    </div>
  );
}
