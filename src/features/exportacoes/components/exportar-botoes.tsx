import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

type Formato = "xlsx" | "pdf";

const ROTULO: Record<Formato, { texto: string; Icone: typeof FileText }> = {
  xlsx: { texto: "Excel", Icone: FileSpreadsheet },
  pdf: { texto: "PDF", Icone: FileText },
};

/**
 * Links de download dos relatórios, já com os filtros da tela na URL (o arquivo traz exatamente o que
 * está na tela). São links comuns (`download`), não ações: funcionam sem JavaScript e o navegador
 * mostra o progresso do arquivo.
 */
export function ExportarBotoes({ rota, params, formatos = ["xlsx", "pdf"] }: { rota: string; params: Record<string, string | undefined>; formatos?: Formato[] }) {
  const href = (formato: Formato) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("formato", formato);
    return `${rota}?${q.toString()}`;
  };
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Exportar">
      <span className="text-sm text-muted-foreground">Exportar:</span>
      {formatos.map((f) => {
        const { texto, Icone } = ROTULO[f];
        return (
          <Button key={f} asChild variant="outline" size="sm">
            <a href={href(f)} download>
              <Icone />
              {texto}
            </a>
          </Button>
        );
      })}
    </div>
  );
}
