"use client";
import { useState } from 'react';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { DistributionChart, TrendChart } from '@/app/AnalyticsCharts';
import PaginatedItems from '@/app/PaginatedItems';
import type { TaskModuleData } from '@/app/TasksModule';
import type { AgendaModuleData } from '@/app/AgendaModule';
import { liaCalendarDate } from '@/lib/lia-date-filter';

type Task=TaskModuleData['tasks'][number];
type Employee={id:string;displayName:string;departmentId:string|null;departmentIds:string[];active:boolean};
type Sector={id:string;name:string;active:boolean;coordinatorUserIds?:string[]};
type Item={id:string;module:string;team:string;owner:string;status:string;created_at:string};
const rate=(part:number,total:number)=>total?`${Math.round(part/total*100)}%`:'—';
const completed=(task:Task)=>Boolean(task.completedAt)&&!task.cancelled;
function performance(tasks:Task[]) {
  const done=tasks.filter(completed),eligible=tasks.filter(t=>!t.cancelled);
  const timed=done.filter(t=>t.slaDueAt||t.dueAt);
  const onTime=timed.filter(t=>new Date(t.completedAt!).getTime()<=new Date((t.slaDueAt||t.dueAt)!).getTime());
  const durations=done.map(t=>(Date.parse(t.completedAt!)-Date.parse(t.createdAt))/86400000).filter(d=>Number.isFinite(d)&&d>=0);
  return {done:done.length,active:eligible.length-done.length,cancelled:tasks.filter(t=>t.cancelled).length,overdue:eligible.filter(t=>!t.completedAt&&(t.slaState==='Vencido'||Boolean((t.slaDueAt||t.dueAt)&&Date.parse((t.slaDueAt||t.dueAt)!)<Date.now()))).length,completion:rate(done.length,eligible.length),sla:rate(onTime.length,timed.length),duration:durations.length?`${(durations.reduce((s,d)=>s+d,0)/durations.length).toLocaleString('pt-BR',{maximumFractionDigits:1})} dias`:'—'};
}
function Kpis({entries}:{entries:Array<[string,string|number,string]>}) {return <section className="operation-bi-kpis">{entries.map(([label,value,note])=><article key={label}><BarChart3/><span><small>{label}</small><strong>{value}</strong><em>{note}</em></span></article>)}</section>}
function Panel({title,children}:{title:string;children:React.ReactNode}) {return <section className="analytics-chart-panel"><h3>{title}</h3>{children}</section>}

export function EmployeePerformanceCharts({tasks,commitments}:{tasks:Task[];commitments:AgendaModuleData['commitments']}) {
  const stats=performance(tasks);
  const months=Array.from({length:6},(_,i)=>{const date=new Date();date.setDate(1);date.setMonth(date.getMonth()-5+i);return liaCalendarDate(date.toISOString()).slice(0,7)});
  return <section className="employee-performance-charts"><Kpis entries={[
    ['Taxa de conclusão',stats.completion,`${stats.done} concluídas · ${stats.active} ativas`],['Concluídas no prazo',stats.sla,'Conclusões com prazo informado'],['Tarefas vencidas',stats.overdue,'Tarefas ativas além do prazo'],['Tempo médio de conclusão',stats.duration,'Da criação até a conclusão registrada']
  ]}/><div className="analytics-chart-grid"><Panel title="Tarefas por status"><DistributionChart title="Tarefas por status" entries={[...new Set(tasks.map(t=>t.statusName))].map(label=>({label,count:tasks.filter(t=>t.statusName===label).length}))} donut/></Panel><Panel title="Conclusões por mês"><TrendChart title="Tarefas concluídas por mês" entries={months.map(month=>({label:month.split('-').reverse().join('/'),value:tasks.filter(t=>completed(t)&&liaCalendarDate(t.completedAt!).startsWith(month)).length}))}/></Panel><Panel title="Carga por setor"><DistributionChart title="Tarefas por setor" entries={[...new Set(tasks.map(t=>t.departmentName))].map(label=>({label,count:tasks.filter(t=>t.departmentName===label).length}))}/></Panel><Panel title="Agenda por status"><DistributionChart title="Compromissos por status" entries={[...new Set(commitments.map(c=>c.statusName))].map(label=>({label,count:commitments.filter(c=>c.statusName===label).length}))}/></Panel></div></section>;
}

export function SectorIndicatorsBoard({sectors,employees,tasks=[],agenda,items,onClose}:{sectors:Sector[];employees:Employee[];tasks?:Task[];agenda:AgendaModuleData|null;items:Item[];onClose:()=>void}) {
  const [sector,setSector]=useState('all'),[from,setFrom]=useState(''),[to,setTo]=useState('');
  const invalid=Boolean(from&&to&&from>to);
  const period=(date:string)=>!invalid&&(!from||liaCalendarDate(date)>=from)&&(!to||liaCalendarDate(date)<=to);
  const rows=sectors.filter(d=>sector==='all'||d.id===sector).map(d=>{
    const people=employees.filter(e=>e.departmentId===d.id||e.departmentIds.includes(d.id));
    const work=tasks.filter(t=>(t.currentDepartmentId===d.id||t.departmentName===d.name)&&period(t.createdAt));
    const commitments=agenda?.commitments.filter(c=>agenda.calendars.some(a=>a.id===c.agendaId&&(a.departmentId===d.id||a.departmentName===d.name))&&period(c.startsAt))??[];
    const records=items.filter(i=>!['tasks','work'].includes(i.module)&&i.team===d.name&&period(i.created_at));
    return {sector:d,people,work,commitments,records,stats:performance(work)};
  });
  const scopedTasks=[...new Map(rows.flatMap(r=>r.work).map(t=>[t.id,t])).values()];
  const stats=performance(scopedTasks);
  const moduleNames:Record<string,string>={cs:'Acompanhamentos',lia:'LIA',commercial:'Comercial',support:'Atendimentos',ti:'Desenvolvimento',marketing:'Marketing',serviceRequests:'Chamados',serviceFollowup:'Acompanhamento de chamados',hr:'RH',cancellations:'Cancelamentos'};
  const records=rows.flatMap(r=>r.records);
  return <main className="operation-bi-page"><section className="operation-bi-board"><header><div><span className="operation-bi-mark"><BarChart3/></span><span><small>COLABORADORES · SETORES</small><h1>Indicadores dos setores</h1><p>Equipe, carga de trabalho e eficiência operacional.</p></span></div><button className="secondary-button" onClick={onClose}><ArrowLeft size={16}/>Voltar aos setores</button></header>
    <section className="analytics-filter-row"><label>Setor<select value={sector} onChange={e=>setSector(e.target.value)}><option value="all">Todos os setores</option>{sectors.map(d=><option key={d.id} value={d.id}>{d.name}{d.active?'':' · Inativo'}</option>)}</select></label><label>Data inicial<input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label><label>Data final<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label><button className="secondary-button" onClick={()=>{setSector('all');setFrom('');setTo('')}}>Limpar filtros</button></section>{invalid&&<p className="form-error" role="alert">A data final deve ser igual ou posterior à inicial.</p>}
    <Kpis entries={[
      ['Setores',rows.length,`${rows.filter(r=>r.sector.active).length} ativos`],['Colaboradores ativos',new Set(rows.flatMap(r=>r.people.filter(p=>p.active).map(p=>p.id))).size,'Pessoas únicas nos setores selecionados'],['Tarefas',scopedTasks.length,`${stats.active} ativas · ${stats.cancelled} canceladas`],['Taxa de conclusão',stats.completion,`${stats.done} concluídas, excluindo canceladas`],['Concluídas no prazo',stats.sla,'Conclusões com prazo informado'],['Tarefas vencidas',stats.overdue,'Somente tarefas ativas'],['Tempo médio de conclusão',stats.duration,'Da criação até a conclusão'],['Compromissos',new Set(rows.flatMap(r=>r.commitments.map(c=>c.id))).size,'Agendas vinculadas aos setores']
    ]}/>
    <div className="analytics-chart-grid"><Panel title="Carga de tarefas por setor"><DistributionChart title="Tarefas por setor" entries={rows.map(r=>({label:r.sector.name,count:r.work.length}))}/></Panel><Panel title="Conclusões por setor"><DistributionChart title="Tarefas concluídas por setor" entries={rows.map(r=>({label:r.sector.name,count:r.stats.done}))}/></Panel><Panel title="Tarefas vencidas por setor"><DistributionChart title="Tarefas vencidas por setor" entries={rows.map(r=>({label:r.sector.name,count:r.stats.overdue}))}/></Panel><Panel title="Outras atividades por funcionalidade"><DistributionChart title="Registros operacionais por funcionalidade" entries={[...new Set(records.map(i=>i.module))].map(module=>({label:moduleNames[module]||module,count:records.filter(i=>i.module===module).length}))}/></Panel></div>
    <div className="analytics-table-scroll"><table className="analytics-data-table"><thead><tr>{['Setor','Situação','Coordenadores','Equipe ativa / total','Tarefas','Ativas','Concluídas','Vencidas','Canceladas','Conclusão','No prazo','Tempo médio','Tarefas / colaborador ativo','Agenda','Demais atividades'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody><PaginatedItems table label="setores" resetKey={`${sector}:${from}:${to}`}>{rows.map(r=><tr key={r.sector.id}><th>{r.sector.name}</th><td>{r.sector.active?'Ativo':'Inativo'}</td><td>{employees.filter(e=>r.sector.coordinatorUserIds?.includes(e.id)).map(e=>e.displayName).join(', ')||'Não informado'}</td><td>{r.people.filter(e=>e.active).length} / {r.people.length}</td><td>{r.work.length}</td><td>{r.stats.active}</td><td>{r.stats.done}</td><td>{r.stats.overdue}</td><td>{r.stats.cancelled}</td><td>{r.stats.completion}</td><td>{r.stats.sla}</td><td>{r.stats.duration}</td><td>{r.people.some(e=>e.active)?(r.stats.active/r.people.filter(e=>e.active).length).toLocaleString('pt-BR',{maximumFractionDigits:1}):'—'}</td><td>{r.commitments.length}</td><td>{r.records.length}<small>{[...new Set(r.records.map(i=>i.module))].map(module=>`${moduleNames[module]||module}: ${r.records.filter(i=>i.module===module).length}`).join(' · ')}</small></td></tr>)}</PaginatedItems></tbody></table></div>
    <p className="analytics-method-note">O período considera a criação das tarefas e atividades e a data dos compromissos. Conclusão = tarefas concluídas ÷ tarefas não canceladas. No prazo = conclusões até o prazo de SLA/entrega ÷ conclusões com prazo. Os vínculos de setor usam os cadastros de equipe, tarefa e agenda; atividades sem setor vinculado não entram na comparação.</p>
  </section></main>;
}
