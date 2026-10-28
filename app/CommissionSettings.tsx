"use client";

import { Save, Settings, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { commissionScoreTiers, validScoreTiers, type CommissionRule, type CommissionScope, type ScoreTier } from "@/lib/commission-rules";

type Catalog = { id: string; catalog: string; name: string; description: string; active: boolean };
type Employee = { id: string; displayName: string; departmentName: string };
type SavedRule = { entry: Catalog; rule: CommissionRule };
const scopeLabel = (scope: CommissionScope) => scope === "commercial" ? "Comercial" : scope === "lia" ? "LIA" : "Sucesso do Cliente";
const parseRule = (entry: Catalog): SavedRule | null => {
  try { const rule = JSON.parse(entry.description) as CommissionRule; return entry.catalog === "commissionRule" && rule.kind === "commissionRule" ? { entry, rule } : null; }
  catch { return null; }
};

export default function CommissionSettings({ catalogs, employees, busy, operate, onBack }: {
  catalogs: Catalog[]; employees: Employee[]; busy: boolean; onBack: () => void;
  operate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false>;
}) {
  const [scope, setScope] = useState<CommissionScope>("commercial");
  const [employeeId, setEmployeeId] = useState("");
  const employee = employees.find(entry => entry.id === employeeId);
  const rules = catalogs.map(parseRule).filter((entry): entry is SavedRule => Boolean(entry));
  const products = [...new Set(catalogs.filter(entry => entry.active && entry.catalog === "commercialProduct").map(entry => entry.name))];
  const entries = scope === "cs" ? ["*"] : ["*", ...products];
  const save = async (product: string, values: Pick<CommissionRule, "type" | "value" | "scoreTiers">, existing?: SavedRule) => {
    if (!employee) return;
    const rule: CommissionRule = { kind: "commissionRule", scope, employeeId: employee.id, employeeName: employee.displayName, product, ...values };
    await operate({ action: "saveCustomerCatalog", id: existing?.entry.id, catalog: "commissionRule",
      name: `${scopeLabel(scope)} · ${employee.displayName} · ${product}`, catalogDescription: JSON.stringify(rule), active: true }, "Regra de comissão salva.");
  };
  return <section className="commission-settings">
    <header className="module-page-header"><div className="module-page-title"><span className="module-page-title-icon"><Settings /></span><span className="module-page-copy"><span className="eyebrow">COMISSÕES · CONFIGURAÇÕES</span><h1>Regras por colaborador</h1><p>Configure as comissões de cada área e a remuneração por faixa de score em CS.</p></span></div><button className="secondary-button" onClick={onBack}>← Voltar às comissões</button></header>
    <nav className="commission-tabs">{(["commercial", "cs", "lia"] as const).map(value => <button key={value} className={scope === value ? "active" : ""} onClick={() => setScope(value)}>{scopeLabel(value)}</button>)}</nav>
    <section className="commission-rule-picker panel"><label>Colaborador<select value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">Selecionar colaborador</option>{employees.map(entry => <option key={entry.id} value={entry.id}>{entry.displayName} · {entry.departmentName}</option>)}</select></label><p>{scope === "cs" ? "O score do cliente determina o percentual da comissão. Configure os limites e os percentuais abaixo." : "Configure a regra geral ou um valor específico por produto. A LIA segue o valor da venda, sem score."}</p></section>
    {!employee ? <div className="commission-empty"><UsersRound /><h2>Selecione um colaborador</h2><p>As regras serão abertas após a seleção.</p></div> : <section className="commission-rule-list">{entries.map(product => {
      const existing = rules.find(entry => entry.rule.scope === scope && entry.rule.employeeId === employee.id && entry.rule.product === product);
      const key = `${scope}-${employee.id}-${product}-${existing?.entry.description ?? "new"}`;
      return scope === "cs" ? <ScoreRuleForm key={key} existing={existing} busy={busy} onSave={tiers => save(product, { type: "percentage", value: 0, scoreTiers: tiers }, existing)} /> :
        <ProductRuleForm key={key} product={product === "*" ? "Regra geral · todos os produtos" : product} existing={existing} busy={busy} onSave={values => save(product, values, existing)} />;
    })}</section>}
  </section>;
}

function ProductRuleForm({ product, existing, busy, onSave }: {
  product: string; existing?: SavedRule; busy: boolean; onSave: (values: Pick<CommissionRule, "type" | "value">) => Promise<void>;
}) {
  const [type, setType] = useState<CommissionRule["type"]>(existing?.rule.type ?? "percentage");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); void onSave({ type, value: Number(form.get("value")) });
  };
  return <form onSubmit={submit}><span><strong>{product}</strong><small>{existing?.entry.active ? "Regra configurada" : "Sem regra ativa"}</small></span><label>Tipo<select value={type} onChange={event => setType(event.target.value as CommissionRule["type"])}><option value="percentage">Porcentagem</option><option value="fixed">Valor fixo</option></select></label><label>{type === "percentage" ? "Percentual (%)" : "Valor fixo (R$)"}<input name="value" type="number" min="0" max={type === "percentage" ? 100 : undefined} step="0.01" required defaultValue={existing?.rule.value ?? 0} /></label><button className="primary-button" disabled={busy}><Save />{existing ? "Atualizar" : "Salvar"}</button></form>;
}

function ScoreRuleForm({ existing, busy, onSave }: { existing?: SavedRule; busy: boolean; onSave: (tiers: ScoreTier[]) => Promise<void> }) {
  const saved=existing?.rule.scoreTiers;const initial=saved&&validScoreTiers(saved)?commissionScoreTiers(saved):[{min:0,max:50,percentage:0},{min:50,max:75,percentage:5},{min:75,max:100,percentage:10},{min:100,max:null,percentage:15}];
  const [rates,setRates]=useState(initial.map(tier=>tier.percentage));const [error,setError]=useState("");
  const labels=["Abaixo de 50%","De 50% a menos de 75%","De 75% até 100%","Acima de 100%"];
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const tiers=initial.map((tier,index)=>({...tier,percentage:index===0?0:rates[index]}));if(!validScoreTiers(tiers)){setError("Informe percentuais entre 0% e 100%.");return;}setError("");void onSave(tiers);}
  return <form className="commission-score-rule" onSubmit={submit}><header><span><small>SUCESSO DO CLIENTE</small><h2>Comissão por score do cliente</h2><p>O percentual é aplicado sobre o valor do cliente. Scores de 200%, 300% ou mais usam a faixa acima de 100%.</p></span><b>{saved?"Faixas configuradas":"Configure os percentuais"}</b></header><div className="commission-score-tiers">{rates.map((rate,index)=><article key={index}><small>FAIXA {index+1}</small><strong>{labels[index]}</strong><label>Comissão (%)<input aria-label={"Comissão da faixa "+(index+1)} type="number" min="0" max="100" step="0.01" required disabled={index===0} value={index===0?0:rate} onChange={event=>setRates(values=>values.map((value,position)=>position===index?Number(event.target.value):value))}/></label><p>{index===0?"Sem comissão abaixo de 50%.":"Em uma base de R$ 1.000: "}{index>0&&<b>{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(rate*10)}</b>}</p></article>)}</div><footer><span>{error?<strong role="alert">{error}</strong>:"50% entra na segunda faixa; 75% na terceira; 100% permanece na terceira. Acima de 100%, usa a quarta faixa."}</span><button className="primary-button" disabled={busy}><Save size={16}/>Salvar faixas de comissão</button></footer></form>;
}
