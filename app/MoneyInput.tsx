"use client";

import { useState, type InputHTMLAttributes } from "react";
import { moneyInputValue, parseMoneyInput } from "@/lib/money";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value: number;
  onValueChange: (value: number) => void;
};

export default function MoneyInput({ value, onValueChange, onBlur, ...props }: Props) {
  const [draft, setDraft] = useState({ value, text: moneyInputValue(value) });
  const text = draft.value === value ? draft.text : moneyInputValue(value);
  return <input {...props} type="text" inputMode="decimal" value={text}
    onChange={event => {
      const text = event.target.value;
      const cents = parseMoneyInput(text);
      const next = cents === null ? value : cents / 100;
      event.currentTarget.setCustomValidity(cents === null ? "Informe um valor válido com até duas casas decimais." : "");
      setDraft({ value: next, text });
      if (cents !== null) onValueChange(next);
    }}
    onBlur={event => {
      const cents = parseMoneyInput(event.target.value);
      if (cents !== null) setDraft({ value: cents / 100, text: moneyInputValue(cents / 100) });
      onBlur?.(event);
    }} />;
}
