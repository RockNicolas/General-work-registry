"use client";

import { Copy, KeyRound, Loader2, Webhook } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { desativarWebhookAction, gerarSegredoWebhookAction, registrarWebhookAction } from "../actions";

async function copiar(texto: string, aviso: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
  }
}

/**
 * Webhook: o ERP avisa quando algo muda e o RGO sincroniza na hora. O segredo só aparece uma vez
 * (guardamos apenas o hash), então ele é exibido logo após ser gerado.
 */
export function WebhookCard({ integracaoId, url, ativo, eventos, podeRegistrar }: { integracaoId: string; url: string; ativo: boolean; eventos: string[]; podeRegistrar: boolean }) {
  const router = useRouter();
  const [segredo, setSegredo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"gerar" | "registrar" | null>(null);
  const [eventosTexto, setEventosTexto] = useState(eventos.join("\n"));
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setOcupado("gerar");
    setErro(null);
    try {
      const r = await gerarSegredoWebhookAction(integracaoId);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setSegredo(r.data.segredo);
      router.refresh();
    } catch {
      setErro("Não foi possível gerar o segredo. Tente novamente.");
    } finally {
      setOcupado(null);
    }
  }

  async function registrar() {
    const lista = [...new Set(eventosTexto.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean))];
    setOcupado("registrar");
    setErro(null);
    try {
      const r = await registrarWebhookAction(integracaoId, lista);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setSegredo(null);
      toast.success("Webhook registrado no ERP.");
      router.refresh();
    } catch {
      setErro("Não foi possível registrar o webhook. Tente novamente.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="size-5" /> Webhook
          <Badge variant={ativo ? "default" : "secondary"}>{ativo ? "Ativo" : "Inativo"}</Badge>
        </CardTitle>
        <CardDescription>
          Opcional. Com o webhook, o ERP avisa quando algo muda e o RGO sincroniza em seguida, sem esperar o próximo horário agendado. Os dados sempre são lidos pela API do ERP; o aviso apenas dispara a leitura.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-2">
          <Label htmlFor="webhook-url">URL para cadastrar no ERP</Label>
          <div className="flex gap-2">
            <Input id="webhook-url" readOnly value={url} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" aria-label="Copiar URL" onClick={() => copiar(url, "URL copiada.")}>
              <Copy />
            </Button>
          </div>
        </div>

        {segredo && (
          <Alert>
            <KeyRound className="size-4" />
            <AlertTitle>Copie o segredo agora</AlertTitle>
            <AlertDescription className="grid gap-2">
              <span>Ele não será exibido de novo. O ERP deve enviá-lo no cabeçalho Authorization: Bearer &lt;segredo&gt;.</span>
              <div className="flex gap-2">
                <Input readOnly value={segredo} aria-label="Segredo do webhook" className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" aria-label="Copiar segredo" onClick={() => copiar(segredo, "Segredo copiado.")}>
                  <Copy />
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={gerar} disabled={ocupado !== null}>
            {ocupado === "gerar" ? <Loader2 className="animate-spin" /> : <KeyRound />}
            {ativo ? "Gerar novo segredo" : "Gerar segredo"}
          </Button>
          {ativo && (
            <ConfirmDialog
              trigger={<Button variant="ghost">Desativar</Button>}
              title="Desativar o webhook?"
              description="O RGO deixa de aceitar avisos do ERP para esta integração (o agendamento continua valendo). Se o webhook estiver cadastrado no ERP, remova-o lá também."
              confirmLabel="Desativar"
              successMessage="Webhook desativado."
              action={async () => {
                setSegredo(null);
                return desativarWebhookAction(integracaoId);
              }}
            />
          )}
        </div>

        {podeRegistrar && (
          <div className="grid gap-2 rounded-lg border p-3">
            <Label htmlFor="webhook-eventos">Registrar automaticamente no ERP</Label>
            <p className="text-xs text-muted-foreground">
              Informe os eventos a assinar, um por linha, com os nomes da documentação de eventos do ERP. Isso gera um novo segredo e cadastra a URL no ERP.
            </p>
            <Textarea id="webhook-eventos" rows={3} value={eventosTexto} onChange={(e) => setEventosTexto(e.target.value)} className="font-mono text-xs" />
            <div>
              <Button onClick={registrar} disabled={ocupado !== null || eventosTexto.trim() === ""}>
                {ocupado === "registrar" && <Loader2 className="animate-spin" />}
                Registrar no ERP
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
