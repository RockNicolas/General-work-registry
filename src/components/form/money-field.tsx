"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatDecimalBR, parseBRL } from "@/lib/money";

/**
 * Campo de valor em reais que entrega CENTAVOS (inteiro) ao formulário.
 * Aceita "1.234,56", "R$ 10", "-5,5". Enquanto digita, mostra o texto; ao sair, formata.
 */
export function MoneyField({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  placeholder = "0,00",
}: {
  id: string;
  value: number | null | undefined;
  onChange: (centavos: number | null) => void;
  onBlur?: () => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");

  const exibido = editando ? texto : value == null ? "" : formatDecimalBR(value);

  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      aria-invalid={invalid}
      value={exibido}
      onFocus={() => {
        setTexto(value == null ? "" : formatDecimalBR(value));
        setEditando(true);
      }}
      onChange={(e) => {
        setTexto(e.target.value);
        onChange(e.target.value.trim() === "" ? null : parseBRL(e.target.value));
      }}
      onBlur={() => {
        setEditando(false);
        onBlur?.();
      }}
    />
  );
}
