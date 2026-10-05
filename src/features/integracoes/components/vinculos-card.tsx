"use client";

import { Loader2, RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SelectField } from "@/components/form/select-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { criarObrasDoErpAction, listarObrasDoErpAction, salvarVinculosAction } from "../actions";
import type { ObraDoErp, VinculoRow } from "../service";

const NENHUMA = "nenhuma";

export type ObraRgo = { id: string; codigo: string; nome: string };

/** Quais obras do ERP alimentam quais obras do RGO. Sem vínculo, a obra do ERP é ignorada na sincronização. */
export function VinculosCard({ integracaoId, vinculos, obrasRgo }: { integracaoId: string; vinculos: VinculoRow[]; obrasRgo: ObraRgo[] }) {
  const router = useRouter();
  const [obrasErp, setObrasErp] = useState<ObraDoErp[] | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<"carregar" | "salvar" | "criar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setOcupado("carregar");
    setErro(null);
    try {
      const r = await listarObrasDoErpAction(integracaoId);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setObrasErp(r.data);
      setEscolhas(Object.fromEntries(r.data.filter((o) => o.vinculadaA).map((o) => [o.idOrigem, o.vinculadaA as string])));
    } catch {
      setErro("Não foi possível consultar o ERP. Tente novamente.");
    } finally {
      setOcupado(null);
    }
  }

  async function salvar() {
    setOcupado("salvar");
    setErro(null);
    try {
      const lista = Object.entries(escolhas)
        .filter(([, obraId]) => obraId && obraId !== NENHUMA)
        .map(([idOrigem, obraId]) => ({ idOrigem, obraId }));
      const r = await salvarVinculosAction({ integracaoId, vinculos: lista });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success("Vínculos salvos.");
      router.refresh();
      await carregar();
    } catch {
      setErro("Não foi possível salvar os vínculos. Tente novamente.");
    } finally {
      setOcupado(null);
    }
  }

  async function criarFaltantes() {
    if (!obrasErp) return;
    const faltantes = obrasErp.filter((o) => !escolhas[o.idOrigem] || escolhas[o.idOrigem] === NENHUMA).map((o) => ({ idOrigem: o.idOrigem, nome: o.nome }));
    if (faltantes.length === 0) return;
    setOcupado("criar");
    setErro(null);
    try {
      const r = await criarObrasDoErpAction({ integracaoId, obras: faltantes });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success(`${r.data.criadas} obra(s) criada(s) e vinculada(s).`);
      router.refresh();
      await carregar();
    } catch {
      setErro("Não foi possível criar as obras. Tente novamente.");
    } finally {
      setOcupado(null);
    }
  }

  const usadas = new Set(Object.values(escolhas).filter((v) => v && v !== NENHUMA));
  const semVinculo = obrasErp?.filter((o) => !escolhas[o.idOrigem] || escolhas[o.idOrigem] === NENHUMA).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Obras vinculadas</CardTitle>
        <CardDescription>
          Só as obras vinculadas são sincronizadas. Cada obra do ERP corresponde a uma obra do RGO (o mesmo centro de custo / empreendimento).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        {obrasErp === null ? (
          <>
            {vinculos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma obra vinculada ainda.</p>
            ) : (
              <ul className="grid gap-1 text-sm" aria-label="Vínculos atuais">
                {vinculos.map((v) => (
                  <li key={v.idOrigem} className="flex flex-wrap gap-x-2">
                    <span className="text-muted-foreground">ERP {v.idOrigem}</span>
                    <span aria-hidden>→</span>
                    <span className="font-medium">
                      {v.obraCodigo} — {v.obraNome}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <Button variant="outline" onClick={carregar} disabled={ocupado !== null}>
                {ocupado === "carregar" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {vinculos.length === 0 ? "Buscar obras no ERP" : "Editar vínculos"}
              </Button>
            </div>
          </>
        ) : (
          <>
            {obrasErp.length === 0 ? (
              <p className="text-sm text-muted-foreground">O ERP não retornou nenhuma obra para estas credenciais.</p>
            ) : (
              <div className="grid gap-3">
                {obrasErp.map((o) => (
                  <div key={o.idOrigem} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr] sm:items-center">
                    <div className="grid">
                      <span className="font-medium">{o.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        ERP {o.idOrigem}
                        {o.tipo ? ` · ${o.tipo}` : ""}
                      </span>
                    </div>
                    <SelectField
                      id={`vinculo-${o.idOrigem}`}
                      value={escolhas[o.idOrigem] ?? NENHUMA}
                      onChange={(v) => setEscolhas((atual) => ({ ...atual, [o.idOrigem]: v }))}
                      options={[
                        { value: NENHUMA, label: "— Não vincular —" },
                        ...obrasRgo
                          .filter((r) => !usadas.has(r.id) || escolhas[o.idOrigem] === r.id)
                          .map((r) => ({ value: r.id, label: `${r.codigo} — ${r.nome}` })),
                      ]}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={salvar} disabled={ocupado !== null}>
                {ocupado === "salvar" ? <Loader2 className="animate-spin" /> : <Save />}
                Salvar vínculos
              </Button>
              {semVinculo > 0 && (
                <Button variant="outline" onClick={criarFaltantes} disabled={ocupado !== null}>
                  {ocupado === "criar" && <Loader2 className="animate-spin" />}
                  Criar {semVinculo} obra(s) no RGO
                </Button>
              )}
              <Button variant="ghost" onClick={() => setObrasErp(null)} disabled={ocupado !== null}>
                Fechar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
