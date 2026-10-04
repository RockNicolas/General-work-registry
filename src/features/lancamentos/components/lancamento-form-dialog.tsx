"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Field } from "@/components/form/field";
import { FormDialog } from "@/components/form/form-dialog";
import { MoneyField } from "@/components/form/money-field";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  LANCAMENTO_CLASSES,
  LANCAMENTO_CLASSE_LABEL,
  LANCAMENTO_SITUACOES,
  LANCAMENTO_SITUACAO_LABEL,
  LANCAMENTO_TIPOS,
  LANCAMENTO_TIPO_LABEL,
} from "@/lib/domain";
import { atualizarLancamentoAction, criarLancamentoAction } from "../actions";
import { type LancamentoInput, lancamentoSchema } from "../schema";
import type { LancamentoRow } from "../service";

const NENHUMA = "__nenhuma__";
type Opcao = { id: string; label: string };

export function LancamentoFormDialog({
  obraId,
  lancamento,
  etapas,
  categorias,
}: {
  obraId: string;
  lancamento?: LancamentoRow;
  etapas: Opcao[];
  categorias: Opcao[];
}) {
  const editando = !!lancamento;
  const padrao: LancamentoInput = {
    obraId,
    tipo: lancamento?.tipo ?? "custo",
    situacao: lancamento?.situacao ?? "realizado",
    classe: lancamento?.classe ?? "operacional",
    isPrevisao: lancamento?.isPrevisao ?? false,
    valorCentavos: lancamento?.valorCentavos ?? (null as unknown as number),
    dataCompetencia: lancamento?.dataCompetencia ?? "",
    dataVencimento: lancamento?.dataVencimento ?? "",
    dataLiquidacao: lancamento?.dataLiquidacao ?? "",
    categoriaId: lancamento?.categoriaId ?? "",
    etapaId: lancamento?.etapaId ?? "",
    contraparte: lancamento?.contraparte ?? "",
    documento: lancamento?.documento ?? "",
    descricao: lancamento?.descricao ?? "",
  };
  const form = useForm<LancamentoInput>({ resolver: zodResolver(lancamentoSchema), defaultValues: padrao });
  const { control, register, formState } = form;
  const erros = formState.errors;
  const situacao = useWatch({ control, name: "situacao" });
  const tipo = useWatch({ control, name: "tipo" });

  return (
    <FormDialog
      form={form}
      title={editando ? "Editar lançamento" : "Novo lançamento manual"}
      description="Lançamentos de planilha e do ERP são atualizados pela importação/sincronização."
      successMessage={editando ? "Lançamento atualizado." : "Lançamento criado."}
      action={(values) => (editando ? atualizarLancamentoAction(lancamento.id, values) : criarLancamentoAction(values))}
      onSuccess={() => !editando && form.reset(padrao)}
      trigger={
        editando ? (
          <Button variant="ghost" size="icon-sm" aria-label="Editar lançamento">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Novo lançamento
          </Button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tipo" htmlFor="lanc-tipo" error={erros.tipo?.message}>
          <Controller
            control={control}
            name="tipo"
            render={({ field }) => (
              <SelectField
                id="lanc-tipo"
                value={field.value}
                onChange={field.onChange}
                options={LANCAMENTO_TIPOS.map((t) => ({ value: t, label: LANCAMENTO_TIPO_LABEL[t] }))}
              />
            )}
          />
        </Field>
        <Field label="Situação" htmlFor="lanc-situacao" error={erros.situacao?.message}>
          <Controller
            control={control}
            name="situacao"
            render={({ field }) => (
              <SelectField
                id="lanc-situacao"
                value={field.value}
                onChange={field.onChange}
                options={LANCAMENTO_SITUACOES.map((s) => ({ value: s, label: LANCAMENTO_SITUACAO_LABEL[s] }))}
              />
            )}
          />
        </Field>
        <Field label="Classe" htmlFor="lanc-classe" error={erros.classe?.message}>
          <Controller
            control={control}
            name="classe"
            render={({ field }) => (
              <SelectField
                id="lanc-classe"
                value={field.value}
                onChange={field.onChange}
                options={LANCAMENTO_CLASSES.map((c) => ({ value: c, label: LANCAMENTO_CLASSE_LABEL[c] }))}
              />
            )}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor (R$)" htmlFor="lanc-valor" error={erros.valorCentavos?.message} hint="Negativo para estorno.">
          <Controller
            control={control}
            name="valorCentavos"
            render={({ field }) => (
              <MoneyField id="lanc-valor" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!erros.valorCentavos} />
            )}
          />
        </Field>
        <Field label="Competência" htmlFor="lanc-competencia" error={erros.dataCompetencia?.message}>
          <Input id="lanc-competencia" type="date" aria-invalid={!!erros.dataCompetencia} {...register("dataCompetencia")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vencimento" htmlFor="lanc-vencimento" error={erros.dataVencimento?.message}>
          <Input id="lanc-vencimento" type="date" {...register("dataVencimento")} />
        </Field>
        <Field
          label={tipo === "custo" ? "Pagamento" : "Recebimento"}
          htmlFor="lanc-liquidacao"
          error={erros.dataLiquidacao?.message}
        >
          <Input id="lanc-liquidacao" type="date" {...register("dataLiquidacao")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoria" htmlFor="lanc-categoria" error={erros.categoriaId?.message}>
          <Controller
            control={control}
            name="categoriaId"
            render={({ field }) => (
              <SelectField
                id="lanc-categoria"
                value={field.value}
                onChange={field.onChange}
                options={categorias.map((c) => ({ value: c.id, label: c.label }))}
                invalid={!!erros.categoriaId}
              />
            )}
          />
        </Field>
        <Field label="Etapa" htmlFor="lanc-etapa" error={erros.etapaId?.message}>
          <Controller
            control={control}
            name="etapaId"
            render={({ field }) => (
              <SelectField
                id="lanc-etapa"
                value={field.value === "" ? NENHUMA : field.value}
                onChange={(v) => field.onChange(v === NENHUMA ? "" : v)}
                options={[{ value: NENHUMA, label: "— Nenhuma —" }, ...etapas.map((e) => ({ value: e.id, label: e.label }))]}
              />
            )}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tipo === "custo" ? "Fornecedor" : "Cliente"} htmlFor="lanc-contraparte" error={erros.contraparte?.message}>
          <Input id="lanc-contraparte" autoComplete="off" {...register("contraparte")} />
        </Field>
        <Field label="Documento (NF/título)" htmlFor="lanc-documento" error={erros.documento?.message}>
          <Input id="lanc-documento" autoComplete="off" {...register("documento")} />
        </Field>
      </div>
      <Field label="Descrição" htmlFor="lanc-descricao" error={erros.descricao?.message}>
        <Input id="lanc-descricao" autoComplete="off" {...register("descricao")} />
      </Field>

      {situacao === "a_realizar" && (
        <Controller
          control={control}
          name="isPrevisao"
          render={({ field }) => (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">Título de previsão</span>
                <span className="text-xs text-muted-foreground">Sem nota fiscal; separado nas faixas de contas a pagar.</span>
              </div>
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Título de previsão" />
            </div>
          )}
        />
      )}
    </FormDialog>
  );
}
