import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ObraNaoEncontrada() {
  return (
    <div className="grid gap-3 py-12 text-center">
      <h1 className="text-xl font-semibold">Obra não encontrada</h1>
      <p className="text-sm text-muted-foreground">
        Ela não existe ou você não tem permissão para vê-la.
      </p>
      <div>
        <Button asChild variant="outline">
          <Link href="/obras">Voltar para as obras</Link>
        </Button>
      </div>
    </div>
  );
}
