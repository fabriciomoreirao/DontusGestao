"use client";

export default function IndicatorTabs<T extends string>({ value, onChange, tabs, label = "Visões dos indicadores", id = "indicator" }: {
  value: T; onChange: (value: T) => void; tabs: Array<{ id: T; label: string }>; label?: string; id?: string;
}) {
  return <nav className="indicator-tabs" role="tablist" aria-label={label}>{tabs.map((tab, index) => <button
    key={tab.id} type="button" role="tab" id={`${id}-tab-${tab.id}`} aria-controls={`${id}-panel-${tab.id}`}
    aria-selected={value === tab.id} tabIndex={value === tab.id ? 0 : -1} className={value === tab.id ? "active" : ""}
    onClick={() => onChange(tab.id)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); onChange(tabs[next].id);
      (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
    }}>{tab.label}</button>)}</nav>;
}
