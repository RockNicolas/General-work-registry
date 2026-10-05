"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { Controller, type Resolver, useForm, useWatch } from "react-hook-form";
import { Field } from "@/components/form/field";
import { FormDialog } from "@/components/form/form-dialog";
import { SelectField } from "@/components/form/select-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ERPS, ERP_LABEL } from "@/lib/domain";
import { atualizarIntegracaoAction, criarIntegracaoAction } from "../actions";
import { AGENDAMENTOS } from "../config";
import { type CriarIntegracaoInput, atualizarIntegracaoSchema, criarIntegracaoSchema } from "../schema";
import type { IntegracaoRow } from "../service";

/** Campo numérico: vazio vira NaN (o schema responde "Informe um número"). */
const numero = { valueAsNumber: true } as const;

export function IntegracaoFormDialog({
  integracao,
  empresas,
  usuarioAtual,
}: {
  integracao?: IntegracaoRow;
  empresas: { id: string; nome: string }[];
  /** Usuário da API, mascarado, só para lembrar o que está salvo (a senha nunca volta do servidor). */
  usuarioAtual?: string;
}) {
  const editando = !!integracao;
  const form = useForm<CriarIntegracaoInput>({
    resolver: zodResolver(editando ? atualizarIntegracaoSchema : criarIntegracaoSchema) as Resolver<CriarIntegracaoInput>,
    defaultValues: {
      empresaId: integracao?.empresaId ?? (empresas.length === 1 ? empresas[0]!.id : ""),
      erp: integracao?.erp ?? "sienge",
      nome: integracao?.nome ?? "",
      endereco: integracao?.endereco ?? "",
      usuario: "",
      senha: "",
      agendamento: integracao?.agendamento ?? "diaria",
      indexadorCorrecaoId: integracao?.config.indexadorCorrecaoId ?? null,
      mesesHistorico: integracao?.config.mesesHistorico ?? 24,
      mesesReprocessar: integracao?.config.mesesReprocessar ?? 3,
      mesesFuturos: integracao?.config.mesesFuturos ?? 6,
      valorPagamento: integracao?.config.valorPagamento ?? "liquido",
      escalaPercentual: integracao?.config.escalaPercentual ?? "0-100",
      sincronizarOrcamento: integracao?.config.sincronizarOrcamento ?? true,
      sincronizarAvanco: integracao?.config.sincronizarAvanco ?? true,
    },
  });
  const { register, control, formState } = form;
  const erros = formState.errors;
  const erp = useWatch({ control, name: "erp" });
  const sienge = erp === "sienge";

  return (
    <FormDialog
      form={form}
      title={editando ? "Editar integração" : "Nova integração"}
      description="As credenciais são guardadas criptografadas e nunca são exibidas depois de salvas."
      successMessage={editando ? "Integração atualizada." : "Integração criada. Teste a conexão para ativá-la."}
      action={(values) => (editando ? atualizarIntegracaoAction(integracao.id, values) : criarIntegracaoAction(values))}
      onSuccess={() => !editando && form.reset()}
      trigger={
        editando ? (
          <Button variant="outline">
            <Pencil />
            Editar
          </Button>
        ) : (
          <Button>
            <Plus />
            Nova integração
          </Button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Empresa" htmlFor="integ-empresa" error={erros.empresaId?.message}>
          <Controller
            control={control}
            name="empresaId"
            render={({ field }) => (
              <SelectField id="integ-empresa" value={field.value} onChange={field.onChange} options={empresas.map((e) => ({ value: e.id, label: e.nome }))} invalid={!!erros.empresaId} disabled={editando} />
            )}
          />
        </Field>
        <Field label="Sistema (ERP)" htmlFor="integ-erp" error={erros.erp?.message}>
          <Controller
            control={control}
            name="erp"
            render={({ field }) => (
              <SelectField id="integ-erp" value={field.value} onChange={field.onChange} options={ERPS.map((e) => ({ value: e, label: ERP_LABEL[e] }))} disabled={editando} />
            )}
          />
        </Field>
      </div>

      {erp !== "sienge" && (
        <Alert>
          <AlertDescription>
            A sincronização com {ERP_LABEL[erp]} ainda não está disponível (aguardando a documentação da API). Você pode cadastrar a integração, mas ela
            não sincroniza por enquanto.
          </AlertDescription>
        </Alert>
      )}

      <Field label="Nome da integração" htmlFor="integ-nome" error={erros.nome?.message}>
        <Input id="integ-nome" autoComplete="off" placeholder="Ex.: Sienge — Construtora Alfa" {...register("nome")} />
      </Field>
      <Field
        label={sienge ? "Subdomínio do Sienge" : "Endereço da API"}
        htmlFor="integ-endereco"
        error={erros.endereco?.message}
        hint={sienge ? "Só o subdomínio: para https://minhaempresa.sienge.com.br informe \"minhaempresa\"." : "URL HTTPS da API."}
      >
        <Input id="integ-endereco" autoComplete="off" {...register("endereco")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Usuário da API"
          htmlFor="integ-usuario"
          error={erros.usuario?.message}
          hint={editando ? `Atual: ${usuarioAtual || "—"}. Deixe em branco para manter.` : undefined}
        >
          <Input id="integ-usuario" autoComplete="off" {...register("usuario")} />
        </Field>
        <Field label="Senha da API" htmlFor="integ-senha" error={erros.senha?.message} hint={editando ? "Deixe em branco para manter a atual." : undefined}>
          <Input id="integ-senha" type="password" autoComplete="new-password" {...register("senha")} />
        </Field>
      </div>

      <Field label="Sincronização automática" htmlFor="integ-agendamento" error={erros.agendamento?.message}>
        <Controller
          control={control}
          name="agendamento"
          render={({ field }) => <SelectField id="integ-agendamento" value={field.value} onChange={field.onChange} options={AGENDAMENTOS.map((a) => ({ value: a.value, label: a.label }))} />}
        />
      </Field>

      {sienge && (
        <Field
          label="Código do indexador de correção"
          htmlFor="integ-indexador"
          error={erros.indexadorCorrecaoId?.message}
          hint="Número do indexador cadastrado no Sienge; é obrigatório na consulta de contas a pagar."
        >
          <Input
            id="integ-indexador"
            type="number"
            inputMode="numeric"
            min={1}
            {...register("indexadorCorrecaoId", { setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)) })}
          />
        </Field>
      )}

      <fieldset className="grid gap-4 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Período e regras</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Histórico (meses)" htmlFor="integ-hist" error={erros.mesesHistorico?.message} hint="Carga histórica.">
            <Input id="integ-hist" type="number" inputMode="numeric" {...register("mesesHistorico", numero)} />
          </Field>
          <Field label="Reprocessar (meses)" htmlFor="integ-reproc" error={erros.mesesReprocessar?.message} hint="A cada sincronização.">
            <Input id="integ-reproc" type="number" inputMode="numeric" {...register("mesesReprocessar", numero)} />
          </Field>
          <Field label="Projeção (meses)" htmlFor="integ-futuros" error={erros.mesesFuturos?.message} hint="Contas a vencer.">
            <Input id="integ-futuros" type="number" inputMode="numeric" {...register("mesesFuturos", numero)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor do pagamento" htmlFor="integ-valor" hint="Líquido = o que saiu do caixa; bruto inclui descontos e acréscimos.">
            <Controller
              control={control}
              name="valorPagamento"
              render={({ field }) => (
                <SelectField
                  id="integ-valor"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: "liquido", label: "Líquido (recomendado)" },
                    { value: "bruto", label: "Bruto" },
                  ]}
                />
              )}
            />
          </Field>
          <Field label="Escala dos percentuais" htmlFor="integ-escala" hint="Como o ERP informa o % de execução.">
            <Controller
              control={control}
              name="escalaPercentual"
              render={({ field }) => (
                <SelectField
                  id="integ-escala"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: "0-100", label: "0 a 100 (ex.: 25 = 25%)" },
                    { value: "0-1", label: "0 a 1 (ex.: 0,25 = 25%)" },
                  ]}
                />
              )}
            />
          </Field>
        </div>
        <div className="grid gap-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            Sincronizar orçamento
            <Controller control={control} name="sincronizarOrcamento" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Sincronizar orçamento" />} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Sincronizar avanço físico
            <Controller control={control} name="sincronizarAvanco" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Sincronizar avanço físico" />} />
          </label>
        </div>
      </fieldset>
    </FormDialog>
  );
}
