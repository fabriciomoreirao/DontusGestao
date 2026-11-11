"use client";

import { Children, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** The thread keeps each module's original actions and authorization handlers. */
export default function CommentHistory({ children, newestFirst = true }: { children: ReactNode; newestFirst?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const rows = Children.toArray(children);
  const visible = expanded ? rows : newestFirst ? rows.slice(0, 5) : rows.slice(-5);
  return <div className="shared-comment-history"><div className="shared-comment-rows">{visible}</div>{rows.length > 5 && <button type="button" className="shared-comment-more" onClick={() => setExpanded(value => !value)}><ChevronDown size={16}/>{expanded ? "Mostrar os últimos 5 comentários" : `Ver mais comentários (${rows.length - 5})`}</button>}</div>;
}
