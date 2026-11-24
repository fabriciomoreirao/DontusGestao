"use client";

import { forwardRef, memo, useCallback, useLayoutEffect, useMemo, useRef, type SelectHTMLAttributes } from "react";
import CustomerOptions from "@/app/CustomerOptions";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  customers: Array<{ id: string; trade_name: string; legal_name?: string; document_masked?: string }>;
  label?: "name" | "tradeName" | "internalId" | "publicId";
  emptyLabel: string;
};

const NativeCustomerSelect = memo(forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function NativeCustomerSelect(props, ref) {
  return <select {...props} ref={ref}/>;
}));

/** An unrelated text-field update must not reconcile thousands of native options. */
export default forwardRef<HTMLSelectElement, Props>(function CustomerSelect({ customers, label, emptyLabel, onChange, ...props }, ref) {
  const change = useRef(onChange);
  useLayoutEffect(() => { change.current = onChange; }, [onChange]);
  const handleChange = useCallback<NonNullable<Props["onChange"]>>(event => change.current?.(event), []);
  const options = useMemo(() => <><option value="">{emptyLabel}</option><CustomerOptions customers={customers} label={label}/></>, [customers, label, emptyLabel]);
  return <NativeCustomerSelect {...props} ref={ref} onChange={handleChange}>{options}</NativeCustomerSelect>;
});
