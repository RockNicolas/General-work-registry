"use client";

import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateBR } from "@/lib/dates";
import { LANCAMENTO_CLASSE_LABEL, LANCAMENTO_SITUACAO_LABEL, LANCAMENTO_TIPO_LABEL, ORIGEM_LABEL } from "@/lib/domain";
import { formatBRL } from "@/lib/money";
import { excluirLancamentoAction } from "../actions";
import type { LancamentoRow } from "../service";
import { LancamentoFormDialog } from "./lancamento-form-dialog";

type Opcao = { id: string; label: string };
const data = (d: string | null) => (d ? formatDateBR(d) : "—");

export function LancamentosTable({
  obraId,
  rows,
  etapas,
  categorias,
  isAdmin,
}: {
  obraId: string;
  rows: LancamentoRow[];
  etapas: Opcao[];
  categorias: Opcao[];
  isAdmin: boolean;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Competência</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Categoria / etapa</TableHead>
            <TableHead>Fornecedor / cliente</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Origem</TableHead>
            {isAdmin && <TableHead className="w-24" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isAdmin ? 9 : 8} className="h-24 text-center text-muted-foreground">
                Nenhum lançamento encontrado.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap">{data(l.dataCompetencia)}</TableCell>
                <TableCell>
                  <Badge variant={l.tipo === "receita" ? "default" : "secondary"}>{LANCAMENTO_TIPO_LABEL[l.tipo]}</Badge>
                  {l.classe !== "operacional" && (
                    <Badge variant="outline" className="ml-1">
                      {LANCAMENTO_CLASSE_LABEL[l.classe]}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{l.categoriaNome}</div>
                  {l.etapaLabel && <div className="text-xs text-muted-foreground">{l.etapaLabel}</div>}
                </TableCell>
                <TableCell>
                  <div>{l.contraparte ?? "—"}</div>
                  {l.documento && <div className="text-xs text-muted-foreground">{l.documento}</div>}
                </TableCell>
                <TableCell className="whitespace-nowrap">{data(l.dataVencimento)}</TableCell>
                <TableCell>
                  {LANCAMENTO_SITUACAO_LABEL[l.situacao]}
                  {l.isPrevisao && <span className="ml-1 text-xs text-muted-foreground">(previsão)</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{formatBRL(l.valorCentavos)}</TableCell>
                <TableCell>{ORIGEM_LABEL[l.origem]}</TableCell>
                {isAdmin && (
                  <TableCell>
                    {l.origem === "manual" && (
                      <div className="flex justify-end gap-1">
                        <LancamentoFormDialog obraId={obraId} lancamento={l} etapas={etapas} categorias={categorias} />
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label="Excluir lançamento">
                              <Trash2 />
                            </Button>
                          }
                          title="Excluir lançamento?"
                          description={`O lançamento de ${formatBRL(l.valorCentavos)} será removido.`}
                          successMessage="Lançamento excluído."
                          action={() => excluirLancamentoAction(obraId, l.id)}
                        />
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
