"use client";

import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Field } from "@/components/form/field";
import { SelectField } from "@/components/form/select-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DATASETS, MODELO } from "../modelo";

const LIMITE_MB = 10;

export function UploadForm({ empresas }: { empresas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [empresaId, setEmpresaId] = useState(empresas.length === 1 ? empresas[0]!.id : "");
  const [dataset, setDataset] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const ehCsv = nomeArquivo.toLowerCase().endsWith(".csv");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const arquivo = inputArquivo.current?.files?.[0];
    const novos: Record<string, string> = {};
    if (!empresaId) novos.empresaId = "Escolha a empresa";
    if (!arquivo) novos.arquivo = "Selecione um arquivo .xlsx ou .csv";
    else if (!/\.(xlsx|csv)$/i.test(arquivo.name)) novos.arquivo = "Use um arquivo .xlsx ou .csv";
    else if (arquivo.size > LIMITE_MB * 1024 * 1024) novos.arquivo = `O arquivo passa do limite de ${LIMITE_MB} MB`;
    if (ehCsv && !dataset) novos.dataset = "Informe o que o arquivo contém";
    setErros(novos);
    setErroGeral(null);
    if (Object.keys(novos).length > 0 || !arquivo) return;

    setEnviando(true);
    try {
      const corpo = new FormData();
      corpo.set("empresaId", empresaId);
      corpo.set("arquivo", arquivo);
      if (ehCsv) corpo.set("dataset", dataset);

      const resposta = await fetch("/api/importacoes", { method: "POST", body: corpo });
      const json = (await resposta.json().catch(() => null)) as { id?: string; error?: string; fieldErrors?: Record<string, string> } | null;
      if (!resposta.ok || !json?.id) {
        setErroGeral(json?.error ?? "Não foi possível enviar o arquivo. Tente novamente.");
        if (json?.fieldErrors) setErros(json.fieldErrors);
        return;
      }
      router.push(`/importacoes/${json.id}`);
    } catch {
      setErroGeral("Não foi possível enviar o arquivo. Verifique a conexão e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="size-5" />
          Enviar planilha
        </CardTitle>
        <CardDescription>
          Use o modelo padrão (.xlsx ou .csv). O sistema mostra uma prévia e os erros por linha antes de gravar qualquer coisa.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button asChild variant="outline" size="sm">
            <a href="/api/importacoes/modelo?formato=xlsx" download>
              <Download />
              Baixar modelo (.xlsx)
            </a>
          </Button>
          <span className="text-muted-foreground">ou modelo .csv de:</span>
          {DATASETS.map((d) => (
            <Button key={d} asChild variant="ghost" size="sm">
              <a href={`/api/importacoes/modelo?formato=csv&dataset=${d}`} download>
                {MODELO[d].titulo.split(" (")[0]}
              </a>
            </Button>
          ))}
        </div>

        <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
          {erroGeral && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{erroGeral}</AlertDescription>
            </Alert>
          )}
          <Field label="Empresa" htmlFor="imp-empresa" error={erros.empresaId}>
            <SelectField
              id="imp-empresa"
              value={empresaId}
              onChange={setEmpresaId}
              options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
              invalid={!!erros.empresaId}
            />
          </Field>
          <Field label="Arquivo" htmlFor="imp-arquivo" error={erros.arquivo} hint={`.xlsx ou .csv, até ${LIMITE_MB} MB`}>
            <Input
              id="imp-arquivo"
              ref={inputArquivo}
              type="file"
              accept=".xlsx,.csv"
              aria-invalid={!!erros.arquivo}
              onChange={(e) => setNomeArquivo(e.target.files?.[0]?.name ?? "")}
            />
          </Field>
          {ehCsv && (
            <Field label="O que o .csv contém" htmlFor="imp-dataset" error={erros.dataset} className="sm:col-span-2">
              <SelectField
                id="imp-dataset"
                value={dataset}
                onChange={setDataset}
                options={DATASETS.map((d) => ({ value: d, label: MODELO[d].titulo }))}
                invalid={!!erros.dataset}
              />
            </Field>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={enviando}>
              {enviando ? <Loader2 className="animate-spin" /> : <Upload />}
              Enviar e conferir
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
