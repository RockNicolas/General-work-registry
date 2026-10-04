"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompetenciaBR, formatDateBR, formatDateTimeBR } from "@/lib/dates";
import { LANCAMENTO_TIPO_LABEL } from "@/lib/domain";
import { formatBRL } from "@/lib/money";
import { formatBps } from "@/lib/percent";
import { cancelarImportacaoAction, confirmarImportacaoAction } from "../actions";
import type { AvancoImportar, ErroLinha, LancamentoImportar, OrcamentoImportar } from "../montar-previa";
import type { ContagemConjunto, DetalheImportacao } from "../service";
import { ImportacaoStatusBadge } from "./status-badge";

const Numero = ({ titulo, valor, destaque }: { titulo: string; valor: number; destaque?: "erro" | "ok" }) => (
  <Card>
    <CardHeader>
      <CardDescription>{titulo}</CardDescription>
      <CardTitle className={`text-2xl tabular-nums ${destaque === "erro" && valor > 0 ? "text-destructive" : ""}`}>
        {valor.toLocaleString("pt-BR")}
      </CardTitle>
    </CardHeader>
  </Card>
);

function Contagem({ rotulo, c }: { rotulo: string; c?: ContagemConjunto }) {
  if (!c) return null;
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-6 font-medium">{rotulo}</td>
      <td className="py-2 pr-6 tabular-nums">{c.inseridos}</td>
      <td className="py-2 pr-6 tabular-nums">{c.atualizados}</td>
      <td className="py-2 tabular-nums">{c.inalterados}</td>
    </tr>
  );
}

export function ImportacaoDetalhe({ d }: { d: DetalheImportacao }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erroGravacao, setErroGravacao] = useState<string | null>(null);

  const validas = d.contagens.lancamentos + d.contagens.orcamento + d.contagens.avanco;
  const aguardando = d.status === "previa";
  const obra = (id: string) => d.rotulos.obras[id] ?? "—";

  async function confirmar() {
    setConfirmando(true);
    setErroGravacao(null);
    try {
      const r = await confirmarImportacaoAction(d.id);
      if (!r.ok) {
        setErroGravacao(r.error);
        return;
      }
      toast.success("Importação concluída.");
      router.refresh();
    } catch {
      setErroGravacao("Não foi possível concluir a importação. Tente novamente.");
    } finally {
      setConfirmando(false);
    }
  }

  const colunasErro: ColumnDef<ErroLinha>[] = [
    { accessorKey: "aba", header: "Aba" },
    { accessorKey: "linha", header: "Linha", cell: ({ row }) => (row.original.linha === 0 ? "—" : row.original.linha) },
    { accessorKey: "coluna", header: "Coluna", cell: ({ row }) => row.original.coluna ?? "—" },
    { accessorKey: "valor", header: "Valor informado", cell: ({ row }) => row.original.valor ?? "—" },
    { accessorKey: "mensagem", header: "Problema" },
  ];

  const colunasLanc: ColumnDef<LancamentoImportar>[] = [
    { accessorKey: "linha", header: "Linha" },
    { id: "obra", header: "Obra", accessorFn: (l) => obra(l.obraId) },
    { id: "tipo", header: "Tipo", accessorFn: (l) => LANCAMENTO_TIPO_LABEL[l.tipo] },
    { id: "comp", header: "Competência", accessorFn: (l) => formatDateBR(l.dataCompetencia) ?? "" },
    { id: "cat", header: "Categoria", accessorFn: (l) => d.rotulos.categorias[l.categoriaId] ?? "—" },
    { id: "etapa", header: "Etapa", accessorFn: (l) => (l.etapaId ? (d.rotulos.etapas[l.etapaId] ?? "—") : "—") },
    { id: "valor", header: "Valor", accessorFn: (l) => l.valorCentavos, cell: ({ row }) => <span className="tabular-nums">{formatBRL(row.original.valorCentavos)}</span> },
    { id: "sit", header: "Situação", accessorFn: (l) => (l.situacao === "realizado" ? "Realizado" : "A realizar") },
    { id: "forn", header: "Fornecedor / cliente", accessorFn: (l) => l.contraparte ?? "—" },
  ];

  const colunasOrc: ColumnDef<OrcamentoImportar>[] = [
    { accessorKey: "linha", header: "Linha" },
    { id: "obra", header: "Obra", accessorFn: (o) => obra(o.obraId) },
    { id: "etapa", header: "Etapa", accessorFn: (o) => (o.etapaId ? (d.rotulos.etapas[o.etapaId] ?? "—") : "—") },
    { id: "cat", header: "Categoria", accessorFn: (o) => (o.categoriaId ? (d.rotulos.categorias[o.categoriaId] ?? "—") : "—") },
    { id: "valor", header: "Previsto", accessorFn: (o) => o.valorPrevistoCentavos, cell: ({ row }) => <span className="tabular-nums">{formatBRL(row.original.valorPrevistoCentavos)}</span> },
    { id: "versao", header: "Versão", accessorFn: (o) => `v${o.versao}` },
  ];

  const colunasAvanco: ColumnDef<AvancoImportar>[] = [
    { accessorKey: "linha", header: "Linha" },
    { id: "obra", header: "Obra", accessorFn: (a) => obra(a.obraId) },
    { id: "comp", header: "Competência", accessorFn: (a) => formatCompetenciaBR(a.competencia) ?? "" },
    { accessorKey: "tipo", header: "Tipo" },
    { id: "versao", header: "Versão", accessorFn: (a) => `v${a.versao}` },
    { id: "mes", header: "% no mês", accessorFn: (a) => a.pctMesBps, cell: ({ row }) => formatBps(row.original.pctMesBps) },
    { id: "acum", header: "% acumulado", accessorFn: (a) => a.pctAcumBps, cell: ({ row }) => formatBps(row.original.pctAcumBps) },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <ImportacaoStatusBadge status={d.status} />
        <span>
          {d.empresaNome} · enviada por {d.usuarioNome ?? "—"} em {formatDateTimeBR(new Date(d.criadoEm))}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Numero titulo="Linhas lidas" valor={d.total} />
        <Numero titulo="Linhas válidas" valor={d.ok} />
        <Numero titulo="Linhas com erro" valor={d.comErro} destaque="erro" />
      </div>

      {d.jaImportadoEm && aguardando && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Este arquivo já foi importado</AlertTitle>
          <AlertDescription>
            O mesmo conteúdo foi importado em {formatDateTimeBR(new Date(d.jaImportadoEm))}. Importar de novo não duplica: as linhas
            iguais são mantidas e as alteradas são atualizadas.
          </AlertDescription>
        </Alert>
      )}

      {d.avisos.map((a) => (
        <Alert key={a}>
          <AlertDescription>{a}</AlertDescription>
        </Alert>
      ))}

      {d.status === "falhou" && (
        <Alert variant="destructive">
          <AlertTitle>Nada foi gravado</AlertTitle>
          <AlertDescription>
            {d.resumo?.erro ??
              (validas === 0
                ? "Nenhuma linha válida foi encontrada. Corrija os problemas abaixo e envie o arquivo novamente."
                : "A importação não foi concluída.")}
          </AlertDescription>
        </Alert>
      )}

      {aguardando && (
        <Card>
          <CardHeader>
            <CardTitle>Confirmar importação</CardTitle>
            <CardDescription>
              Nada foi gravado ainda. Ao confirmar, {validas.toLocaleString("pt-BR")} linha(s) válida(s) serão gravadas
              {d.comErro > 0 ? `; as ${d.comErro} com erro serão ignoradas` : ""}. Tudo é gravado junto: se algo falhar, nada é alterado.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {erroGravacao && (
              <Alert variant="destructive">
                <AlertDescription>{erroGravacao}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={confirmar} disabled={confirmando}>
                {confirmando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Importar {validas.toLocaleString("pt-BR")} linha(s) válida(s)
              </Button>
              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={confirmando}>
                    <Trash2 />
                    Descartar
                  </Button>
                }
                title="Descartar esta importação?"
                description="A prévia e os erros serão removidos. Nenhum dado foi gravado."
                confirmLabel="Descartar"
                successMessage="Importação descartada."
                action={async () => {
                  const r = await cancelarImportacaoAction(d.id);
                  if (r.ok) router.push("/importacoes");
                  return r;
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {(d.status === "concluida" || d.status === "concluida_com_erros") && d.resumo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5" /> Importação concluída
            </CardTitle>
            <CardDescription>
              {d.status === "concluida_com_erros" ? `${d.comErro} linha(s) com erro foram ignoradas. ` : ""}
              Reimportar o mesmo arquivo não duplica nada.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <table className="w-full max-w-md text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-6 font-normal">Conjunto</th>
                  <th className="py-2 pr-6 font-normal">Novos</th>
                  <th className="py-2 pr-6 font-normal">Atualizados</th>
                  <th className="py-2 font-normal">Sem mudança</th>
                </tr>
              </thead>
              <tbody>
                <Contagem rotulo="Lançamentos" c={d.resumo.lancamentos} />
                <Contagem rotulo="Orçamento" c={d.resumo.orcamento} />
                <Contagem rotulo="Avanço físico" c={d.resumo.avanco} />
              </tbody>
            </table>
            <div>
              <Button asChild variant="outline" size="sm">
                <Link href="/obras">Ver as obras</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {d.errosTotal > 0 && (
        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium">Erros por linha</h2>
            <Badge variant="destructive">{d.errosTotal.toLocaleString("pt-BR")}</Badge>
          </div>
          {d.errosTotal > d.erros.length && (
            <p className="text-sm text-muted-foreground">Mostrando os primeiros {d.erros.length.toLocaleString("pt-BR")}. Corrija estes e envie de novo para ver os demais.</p>
          )}
          <DataTable columns={colunasErro} data={d.erros} searchPlaceholder="Buscar nos erros..." pageSize={15} />
        </section>
      )}

      {aguardando && validas > 0 && (
        <section className="grid gap-6">
          <h2 className="text-lg font-medium">Prévia dos dados válidos</h2>
          {d.contagens.lancamentos > 0 && (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Lançamentos ({d.contagens.lancamentos.toLocaleString("pt-BR")})</h3>
              <DataTable columns={colunasLanc} data={d.amostra.lancamentos} pageSize={10} />
            </div>
          )}
          {d.contagens.orcamento > 0 && (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Orçamento ({d.contagens.orcamento.toLocaleString("pt-BR")})</h3>
              <DataTable columns={colunasOrc} data={d.amostra.orcamento} pageSize={10} />
            </div>
          )}
          {d.contagens.avanco > 0 && (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Avanço físico ({d.contagens.avanco.toLocaleString("pt-BR")})</h3>
              <DataTable columns={colunasAvanco} data={d.amostra.avanco} pageSize={10} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">A prévia mostra até 50 linhas de cada conjunto; todas as linhas válidas serão gravadas.</p>
        </section>
      )}
    </div>
  );
}
