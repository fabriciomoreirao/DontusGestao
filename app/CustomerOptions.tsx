"use client";

import { memo } from "react";

type Customer = {
  id: string;
  trade_name: string;
  legal_name?: string;
  document_masked?: string;
};

/** Keep the customer directory out of text-field renders in the same form. */
export default memo(function CustomerOptions({
  customers,
  label = "name",
}: {
  customers: Customer[];
  label?: "name" | "tradeName" | "internalId" | "publicId";
}) {
  return (
    <>
      {customers.map((customer) => {
        const name =
          label === "tradeName" || label === "internalId"
            ? customer.trade_name
            : customer.trade_name || customer.legal_name;
        const digits = customer.document_masked?.replace(/\D/g, "") ?? "";
        const publicId = digits.length === 6 ? digits : "";
        return (
          <option
            key={customer.id}
            value={customer.id}
            disabled={label === "publicId" && !publicId}
          >
            {label === "internalId"
              ? `${name} · ${customer.id.slice(0, 8)}`
              : label === "publicId"
                ? `${name} · ${publicId || "sem ID Dontus"}`
                : name}
          </option>
        );
      })}
    </>
  );
});
