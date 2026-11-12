"use client";

import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";

import { Plus, Save, Settings, Trash2, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { commissionScoreTiers, defaultSalesTiers, normalizeCommissionName, parseCommissionRule, validSalesTiers, validScoreTiers, type CommissionRule, type CommissionScope, type SalesTier, type ScoreTier } from "@/lib/commission-rules";

type Catalog = { id: string; catalog: string; name: string; description: string; active: boolean };
type Employee = { id: string; displayName: string; departmentName: string };
type SavedRule = { entry: Catalog; rule: CommissionRule };
const scopeLabel = (scope: CommissionScope) => scope === "commercial" ? "Comercial" : scope === "lia" ? "LIA" : "Sucesso do Cliente";
const parseRule = (entry: Catalog): SavedRule | null => {
  const rule = parseCommissionRule(entry.description);
  return entry.catalog === "commissionRule" && rule ? { entry, rule } : null;
};

export default function CommissionSettings({ catalogs, employees, busy, operate, onBack, initialScope = "commercial" }: {
  initialScope?: CommissionScope;
  catalogs: Catalog[]; employees: Employee[]; busy: boolean; onBack: () => void;
  operate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false>;
}) {
  const [scope, setScope] = useState<CommissionScope>(initialScope);
  const [employeeId, setEmployeeId] = useState("");
  const employee = employees.find(entry => entry.id === employeeId);
  const rules = catalogs.map(parseRule).filter((entry): entry is SavedRule => Boolean(entry));
  const entries = ["*"];
  const save = async (product: string, values: Pick<CommissionRule, "type" | "value" | "scoreTiers" | "salesTiers">, existing?: SavedRule) => {
    if (!employee) return;
    const rule: CommissionRule = { kind: "commissionRule", scope, employeeId: employee.id, employeeName: employee.displayName, product, ...values };
    await operate({ action: "saveCustomerCatalog", id: existing?.entry.id, catalog: "commissionRule",
      name: `${scopeLabel(scope)} · ${employee.displayName} · ${product}`, catalogDescription: JSON.stringify(rule), active: true }, "Regra de comissão salva.");
  };
  return <section className="commission-settings">
    <header className="module-page-header"><div className="module-page-title"><span className="module-page-title-icon"><Settings /></span><span className="module-page-copy"><span className="eyebrow">COMISSÕES · CONFIGURAÇÕES</span><h1>Regras por colaborador</h1><p>Configure as comissões de cada área e a remuneração por faixa de score em CS.</p></span></div><button className="secondary-button" onClick={onBack}>← Voltar às comissões</button></header>
    <nav className="commission-tabs">{(["commercial", "cs", "lia"] as const).map(value => <button key={value} className={scope === value ? "active" : ""} onClick={() => setScope(value)}>{scopeLabel(value)}</button>)}</nav>
    <section className="commission-rule-picker panel"><label>Colaborador<SearchablePeopleSelect searchLabel="Colaborador" value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">Selecionar colaborador</option>{employees.map(entry => <option key={entry.id} value={entry.id}>{entry.displayName} · {entry.departmentName}</option>)}</SearchablePeopleSelect></label><p>{scope === "cs" ? "O score do cliente determina o percentual da comissão. Configure os limites e os percentuais abaixo." : scope === "commercial" ? "O total vendido no mês, pela data do ganho no CRM Comercial, define o percentual aplicado a todas as vendas do colaborador." : "Um percentual individual aplicado sobre o valor de cada cliente. Exemplo: R$ 500,00 × 50% = R$ 250,00."}</p></section>
    {!employee ? <div className="commission-empty"><UsersRound /><h2>Selecione um colaborador</h2><p>As regras serão abertas após a seleção.</p></div> : <section className="commission-rule-list">{entries.map(product => {
      const existing = rules.find(entry => entry.rule.scope === scope && entry.rule.employeeId === employee.id && entry.rule.product === product)
        ?? rules.find(entry => entry.rule.scope === scope && !entry.rule.employeeId && normalizeCommissionName(entry.rule.employeeName) === normalizeCommissionName(employee.displayName) && entry.rule.product === product);
      const key = `${scope}-${employee.id}-${product}-${existing?.entry.description ?? "new"}`;
      return scope === "cs" ? <ScoreRuleForm key={key} existing={existing} busy={busy} onSave={tiers => save(product, { type: "percentage", value: 0, scoreTiers: tiers }, existing)} /> :
        scope === "commercial" ? <SalesRuleForm key={key} existing={existing} busy={busy} onSave={tiers => save(product, { type: "percentage", value: 0, salesTiers: tiers }, existing)} /> :
        <ProductRuleForm key={key} product={product === "*" ? "Regra geral · todos os produtos" : product} existing={existing} busy={busy} onSave={values => save(product, values, existing)} />;
    })}</section>}
  </section>;
}

function ProductRuleForm({ product, existing, busy, onSave }: {
  product: string; existing?: SavedRule; busy: boolean; onSave: (values: Pick<CommissionRule, "type" | "value">) => Promise<void>;
}) {
  const type = "percentage" as const;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); void onSave({ type, value: Number(form.get("value")) });
  };
  return <form onSubmit={submit}><span><strong>{product}</strong><small>{existing?.entry.active ? "Regra configurada" : "Sem regra ativa"}</small></span><label>Percentual por cliente (%)<input name="value" type="number" min="0" max="100" step="0.01" required defaultValue={existing?.rule.type === "percentage" ? existing.rule.value : 0} /></label><button className="primary-button" disabled={busy}><Save />{existing ? "Atualizar" : "Salvar"}</button></form>;
}

function SalesRuleForm({ existing, busy, onSave }: { existing?: SavedRule; busy: boolean; onSave: (tiers: SalesTier[]) => Promise<void> }) {
  const [tiers, setTiers] = useState<SalesTier[]>(validSalesTiers(existing?.rule.salesTiers) ? existing.rule.salesTiers : defaultSalesTiers.map(tier => ({ ...tier })));
  const [error, setError] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); if (!validSalesTiers(tiers)) { setError("As faixas devem começar em zero, ser contínuas e ter percentuais entre 0% e 100%."); return; } setError(""); void onSave(tiers); }
  return <form className="commission-score-rule" onSubmit={submit}><header><span><small>COMERCIAL · TOTAL MENSAL</small><h2>Faixas de vendas do colaborador</h2><p>O percentual da faixa incide sobre todo o valor vendido no mês.</p></span><b>{existing?.rule.salesTiers ? "Faixas configuradas" : "Configure as faixas"}</b></header>
    <div className="commission-sales-tiers">{tiers.map((tier, index) => <article key={index}><label>A partir de (R$)<input aria-label={`Início da faixa ${index + 1}`} type="number" min="0" max="1000000000" step="0.01" required disabled={index === 0 || busy} value={tier.minCents / 100} onChange={event => { const cents = Math.round(Number(event.target.value) * 100); setTiers(values => values.map((value, position) => position === index ? { ...value, minCents: cents } : position === index - 1 ? { ...value, maxCents: cents } : value)); }} /></label><span>{tier.maxCents === null ? "Sem limite superior" : `Até R$ ${(tier.maxCents / 100 - 0.01).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}</span><label>Comissão (%)<input aria-label={`Percentual da faixa ${index + 1}`} type="number" min="0" max="100" step="0.01" required value={tier.percentage} disabled={busy} onChange={event => setTiers(values => values.map((value, position) => position === index ? { ...value, percentage: Number(event.target.value) } : value))} /></label>{index > 0 && <button type="button" className="icon-button" disabled={busy} aria-label={`Excluir faixa ${index + 1}`} onClick={() => setTiers(values => values.filter((_, position) => position !== index).map((value, position, remaining) => ({ ...value, maxCents: remaining[position + 1]?.minCents ?? null })))}><Trash2 size={16}/></button>}</article>)}</div>
    <footer><span>{error ? <strong role="alert">{error}</strong> : "R$ 3.000,00 e R$ 4.500,00 já pertencem às faixas seguintes no exemplo inicial."}</span><button type="button" className="secondary-button" disabled={busy || tiers.length >= 20} onClick={() => setTiers(values => { const minCents = values.at(-1)!.minCents + 100000; return [...values.map((value, index) => index === values.length - 1 ? { ...value, maxCents: minCents } : value), { minCents, maxCents: null, percentage: values.at(-1)!.percentage }]; })}><Plus size={16}/>Adicionar faixa</button><button className="primary-button" disabled={busy}><Save size={16}/>Salvar faixas de comissão</button></footer></form>;
}

function ScoreRuleForm({ existing, busy, onSave }: { existing?: SavedRule; busy: boolean; onSave: (tiers: ScoreTier[]) => Promise<void> }) {
  const saved=existing?.rule.scoreTiers;const initial=saved&&validScoreTiers(saved)?commissionScoreTiers(saved):[{min:0,max:50,percentage:0},{min:50,max:75,percentage:5},{min:75,max:100,percentage:10},{min:100,max:null,percentage:15}];
  const [rates,setRates]=useState(initial.map(tier=>tier.percentage));const [error,setError]=useState("");
  const labels=["Abaixo de 50%","De 50% a menos de 75%","De 75% até 100%","Acima de 100%"];
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const tiers=initial.map((tier,index)=>({...tier,percentage:index===0?0:rates[index]}));if(!validScoreTiers(tiers)){setError("Informe percentuais entre 0% e 100%.");return;}setError("");void onSave(tiers);}
  return <form className="commission-score-rule" onSubmit={submit}><header><span><small>SUCESSO DO CLIENTE</small><h2>Comissão por score do cliente</h2><p>O percentual é aplicado sobre o valor do cliente. Scores de 200%, 300% ou mais usam a faixa acima de 100%.</p></span><b>{validScoreTiers(saved)?"Faixas configuradas":"Configure os percentuais"}</b></header><div className="commission-score-tiers">{rates.map((rate,index)=><article key={index}><small>FAIXA {index+1}</small><strong>{labels[index]}</strong><label>Comissão (%)<input aria-label={"Comissão da faixa "+(index+1)} type="number" min="0" max="100" step="0.01" required disabled={index===0} value={index===0?0:rate} onChange={event=>setRates(values=>values.map((value,position)=>position===index?Number(event.target.value):value))}/></label><p>{index===0?"Sem comissão abaixo de 50%.":"Em uma base de R$ 1.000: "}{index>0&&<b>{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(rate*10)}</b>}</p></article>)}</div><footer><span>{error?<strong role="alert">{error}</strong>:"50% entra na segunda faixa; 75% na terceira; 100% permanece na terceira. Acima de 100%, usa a quarta faixa."}</span><button className="primary-button" disabled={busy}><Save size={16}/>Salvar faixas de comissão</button></footer></form>;
}
