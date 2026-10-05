"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeBR } from "@/lib/dates";
import type { SyncGatilho } from "@/lib/domain";
import type { ExecucaoRow } from "../service";
import { SyncStatusBadge } from "./status-badge";

const GATILHO: Record<SyncGatilho, string> = {
  manual: "Manual",
  agendada: "Agendada",
  webhook: "Webhook",
  carga_historica: "Carga histórica",
};

const NIVEL: Record<ExecucaoRow["log"][number]["nivel"], string> = {
  info: "text-muted-foreground",
  aviso: "text-amber-600 dark:text-amber-400",
  erro: "text-destructive",
};

const TRES_HORAS = 3 * 60 * 60 * 1000;

function duracao(e: ExecucaoRow): string | null {
  if (!e.iniciadaEm || !e.finalizadaEm) return null;
  const s = Math.max(0, Math.round((new Date(e.finalizadaEm).getTime() - new Date(e.iniciadaEm).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${s % 60}s`;
}

/** Histórico das últimas execuções. Enquanto houver uma na fila/rodando, a tela se atualiza sozinha. */
export function ExecucoesCard({ execucoes }: { execucoes: ExecucaoRow[] }) {
  const router = useRouter();
  const emAndamento = execucoes.some((e) => e.status === "enfileirada" || e.status === "executando");

  useEffect(() => {
    if (!emAndamento) return;
    const t = setInterval(() => {
      // Execuções "presas" há horas não mantêm a tela em atualização eterna.
      const viva = execucoes.some((e) => (e.status === "enfileirada" || e.status === "executando") && Date.now() - new Date(e.criadaEm).getTime() < TRES_HORAS);
      if (viva) router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [emAndamento, execucoes, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execuções recentes</CardTitle>
        <CardDescription>As últimas 20 sincronizações, com o que foi lido, gravado e os problemas encontrados. É preciso que o processo worker esteja rodando para a fila andar.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {execucoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma sincronização executada ainda.</p>}
        {execucoes.map((e) => (
          <details key={e.id} className="group rounded-lg border">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="whitespace-nowrap font-medium">{formatDateTimeBR(new Date(e.criadaEm))}</span>
              <SyncStatusBadge status={e.status} />
              <Badge variant="outline">{GATILHO[e.gatilho]}</Badge>
              <span className="tabular-nums text-muted-foreground">
                {e.lidos} lidos · {e.gravados} gravados · {e.ignorados} iguais{e.erros > 0 ? ` · ${e.erros} problema(s)` : ""}
                {duracao(e) ? ` · ${duracao(e)}` : ""}
              </span>
            </summary>
            <div className="border-t px-3 py-2">
              {e.log.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem mensagens.</p>
              ) : (
                <ul className="grid gap-1 font-mono text-xs">
                  {e.log.map((l, i) => (
                    <li key={`${l.em}-${i}`} className={NIVEL[l.nivel]}>
                      <span className="opacity-70">{formatDateTimeBR(new Date(l.em))}</span> {l.msg}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
