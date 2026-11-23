"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { paginate, DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import "./pagination.css";

/** Paginate rendered records after the caller's filters, keeping counts and metrics complete. */
export default function PaginatedItems({
  children,
  label = "registros",
  table = false,
  pageSize = DEFAULT_PAGE_SIZE,
  resetKey,
}: {
  children: ReactNode;
  label?: string;
  table?: boolean;
  pageSize?: number;
  resetKey?: string;
}) {
  const rows = Children.toArray(children);
  const identity =
    resetKey ??
    JSON.stringify(
      rows.map((row, index) =>
        isValidElement(row) ? (row.key ?? index) : index,
      ),
    );
  return (
    <PaginatedPage
      key={identity}
      rows={rows}
      label={label}
      table={table}
      pageSize={pageSize}
    />
  );
}

function PaginatedPage({
  rows,
  label,
  table,
  pageSize,
}: {
  rows: ReactNode[];
  label: string;
  table: boolean;
  pageSize: number;
}) {
  const [page, setPage] = useState(1);
  const result = paginate(rows, page, pageSize);
  const controls =
    result.pages > 1 ? (
      <nav className="record-pagination" aria-label={`Páginas de ${label}`}>
        <span role="status" aria-live="polite">
          {result.start}–{result.end} de {result.total} {label}
        </span>
        <div>
          <button
            type="button"
            disabled={result.page <= 1}
            onClick={() => setPage(result.page - 1)}
          >
            <ChevronLeft size={15} aria-hidden="true" />
            Anterior
          </button>
          <span aria-label={`Página ${result.page} de ${result.pages}`}>
            {result.page}/{result.pages}
          </span>
          <button
            type="button"
            disabled={result.page >= result.pages}
            onClick={() => setPage(result.page + 1)}
          >
            Seguinte
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </nav>
    ) : null;
  return (
    <>
      {result.items}
      {controls &&
        (table ? (
          <tr className="record-pagination-row">
            <td
              ref={(cell) => {
                if (!cell) return;
                const owner = cell.closest("table");
                const header = owner?.tHead?.rows[0] ?? owner?.rows[0];
                cell.colSpan = header
                  ? Array.from(header.cells).reduce(
                      (sum, column) => sum + column.colSpan,
                      0,
                    )
                  : 1;
              }}
            >
              {controls}
            </td>
          </tr>
        ) : (
          controls
        ))}
    </>
  );
}
