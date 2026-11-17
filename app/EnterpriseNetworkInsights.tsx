"use client";

import {Activity, ArrowRight, Building2, CheckCircle2, GraduationCap, Layers, Settings, ShieldAlert, ChartNoAxesCombined} from 'lucide-react';
import type {CSSProperties} from 'react';

type Unit = {id:string;name:string;active:boolean;status:string;score:number;trainingPending?:boolean};
type Props = {units:Unit[];average:number;onSelectUnit:(id:string)=>void};

export default function EnterpriseNetworkInsights({units,average,onSelectUnit}:Props) {
  const active=units.filter(unit=>unit.active), inactive=units.length-active.length;
  const pending=active.filter(unit=>unit.trainingPending);
  const counts=new Map<string,number>();
  for(const unit of units) counts.set(unit.status||'Não iniciada',(counts.get(unit.status||'Não iniciada')||0)+1);
  const statusRows=[...counts].sort((a,b)=>b[1]-a[1]);
  const maxStatus=Math.max(1,...statusRows.map(([,count])=>count));
  const percentage=(count:number)=>units.length?Math.round(count*100/units.length):0;
  const summary=[
    {label:'Total de unidades',value:units.length,Icon:Building2,tone:'blue'},
    {label:'Unidades ativas',value:active.length,Icon:CheckCircle2,tone:'green'},
    {label:'Em implantação',value:units.filter(unit=>unit.status==='Em implantação').length,Icon:Settings,tone:'orange'},
    {label:'Em risco',value:units.filter(unit=>unit.status==='Em risco').length,Icon:ShieldAlert,tone:'violet'},
    {label:'Utilização média',value:`${average}%`,Icon:ChartNoAxesCombined,tone:'blue'},
  ];
  return <>
    {pending.length>0&&<section className="enterprise-training-alert"><GraduationCap size={24}/><strong>Treinamento em haver</strong><span>{pending.length} unidade(s) com treinamentos pendentes.</span><button type="button" onClick={()=>onSelectUnit(pending[0].id)}>Ver pendências<ArrowRight size={17}/></button></section>}
    <section className="enterprise-reference-summary" aria-label="Indicadores da rede">{summary.map(({label,value,Icon,tone})=><article key={label} className={`enterprise-metric ${tone}`}><span className="enterprise-metric-icon"><Icon size={29}/></span><div><span>{label}</span><strong>{value}</strong></div></article>)}</section>
    <section className="enterprise-reference-charts" aria-label="Análise das unidades">
      <article className="enterprise-chart-card"><h3><Building2 size={24}/>Ativas vs inativas</h3><div className="enterprise-active-chart"><div className="enterprise-reference-donut" role="img" aria-label={`${units.length} unidades: ${active.length} ativas, ${inactive} inativas`} style={{'--active-percentage':`${percentage(active.length)}%`} as CSSProperties}><span><strong>{units.length}</strong><small>unidades</small></span></div><dl><div><dt><i className="active"/>Ativas</dt><dd>{active.length}<small>({percentage(active.length)}%)</small></dd></div><div><dt><i/>Inativas</dt><dd>{inactive}<small>({percentage(inactive)}%)</small></dd></div></dl></div></article>
      <article className="enterprise-chart-card"><h3><Layers size={24}/>Unidades por status</h3><div className="enterprise-reference-status">{statusRows.map(([label,count])=><div key={label}><span>{label}</span><div role="img" aria-label={`${label}: ${count} unidade(s)`}><i style={{width:`${count*100/maxStatus}%`}}/></div><strong>{count}</strong></div>)}{!units.length&&<p>Nenhuma unidade cadastrada.</p>}</div></article>
      <article className="enterprise-chart-card"><h3><Activity size={24}/>Health score por unidade</h3><EnterpriseUnitScores units={units} onSelect={onSelectUnit}/></article>
    </section>
  </>;
}

function EnterpriseUnitScores({units,onSelect}:{units:Unit[];onSelect:(id:string)=>void}) {
  if(!units.length)return <p className="enterprise-chart-empty">Cadastre unidades para visualizar os scores.</p>;
  const width=Math.max(440,units.length*76), height=172, left=46, top=26, bottom=142;
  const max=Math.max(100,Math.ceil(Math.max(...units.map(unit=>unit.score))/25)*25);
  const step=(width-left-12)/units.length, barWidth=Math.min(66,step*.72);
  return <div className="enterprise-reference-health"><svg viewBox={`0 0 ${width} ${height}`} style={{minWidth:units.length>7?width:undefined}} aria-label="Health score por unidade" role="group">
    {[0,1,2,3,4].map(index=>{const value=max-index*max/4,y=top+index*(bottom-top)/4;return <g key={index}><line x1={left} x2={width-8} y1={y} y2={y}/><text x={left-10} y={y+4} textAnchor="end">{value}%</text></g>})}
    {units.map((unit,index)=>{const x=left+step*(index+.5),barHeight=Math.max(0,unit.score)/max*(bottom-top);return <g key={unit.id} role="button" tabIndex={0} aria-label={`${unit.name}: ${unit.score}%. Visualizar unidade`} onClick={()=>onSelect(unit.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(unit.id)}}}><title>{unit.name}: {unit.score}%</title><rect className="enterprise-health-hit" x={x-step/2} y={0} width={step} height={height}/><rect className={`enterprise-score-bar ${unit.active?'':'inactive'}`} x={x-barWidth/2} y={bottom-barHeight} width={barWidth} height={barHeight} rx={4}/><text className="enterprise-score-value" x={x} y={Math.max(13,bottom-barHeight-8)} textAnchor="middle">{unit.score}%</text><text x={x} y={bottom+21} textAnchor="middle">U{String(index+1).padStart(2,'0')}</text></g>})}
  </svg></div>;
}
