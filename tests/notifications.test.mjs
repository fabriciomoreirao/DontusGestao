import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNotifications,newlyReceived,ownMutationNotificationIds} from '../lib/notifications.ts';
import {chatAppearanceStyle,parseChatAppearance,chatTextColor,chatAppearanceKey} from '../lib/chat-appearance.ts';

const now=Date.parse('2026-10-22T15:00:00Z');
const modules=['cs','lia','waitingQueue','serviceRequests','serviceFollowup','cancellations','marketing','ti','commercial','customers','hr','admin','tasks','work','notices','reminders','internalChat','suggestions'];
const base=()=>({user:{email:'ana@test.local',displayName:'Ana',department:'Suporte',permissions:modules.map(screen=>({screen,canView:true}))},items:[],access:{employees:[{id:'ana-id',email:'ana@test.local',displayName:'Ana',departmentName:'Suporte',departmentNames:['Suporte']},{id:'bia-id',email:'bia@test.local',displayName:'Bia',departmentName:'Suporte',departmentNames:['Suporte']}]},internalChatModule:{currentUserId:'ana-id',rooms:[]}});
const item=(module='cs',detail={kind:'csJourney',track:'activation'})=>({id:'record-1',module,record_type:'Onboarding',title:'Clínica',owner:'Ana',team:'Suporte',created_by:'bia@test.local',description:JSON.stringify(detail),created_at:'2026-10-22T14:00:00Z',updated_at:'2026-10-22T14:00:00Z',version:1});

test('alterar opções, status, versões e datas de atualização não cria novas notificações',()=>{
  const data=base();data.items=[item('cs',{kind:'csJourney',track:'activation',follows:[]})];
  const previous=buildNotifications(data,now);
  data.items[0]={...data.items[0],version:99,status:'Conferência',updated_at:'2026-10-22T15:00:00Z',description:JSON.stringify({kind:'csJourney',track:'activation',usage:'Utilizando',featuresActive:['Agenda'],follows:[{kind:'Atualização',text:'Opções atualizadas',createdAt:'2026-10-22T15:00:00Z',actor:'Bia'}]})};
  assert.deepEqual(newlyReceived(previous.map(entry=>entry.id),buildNotifications(data,now),new Set()),[]);
});

for(const [module,detail] of [['cs',{kind:'csJourney',track:'activation'}],['cs',{kind:'csJourney',track:'retention'}],['waitingQueue',{kind:'waitingQueue'}],['serviceRequests',{kind:'serviceRequest'}],['cancellations',{kind:'cancellationJourney'}],['marketing',{kind:'marketingRequest'}],['ti',{kind:'developmentTask'}],['lia',{kind:'liaJourney'}]])test(`notifica a chegada para o destinatário em ${module} ${detail.track||''}`,()=>{
  const data=base();data.items=[item(module,detail)];assert.equal(buildNotifications(data,now).filter(entry=>entry.category==='arrival').length,1);
  data.items[0].owner='Bia';assert.equal(buildNotifications(data,now).length,0);
});

test('inserções próprias, configurações e campanhas não produzem chegadas',()=>{
  const data=base();data.items=[{...item(),created_by:'ana@test.local'},item('ti',{kind:'developmentKanbanSettings'}),item('marketing',{kind:'marketingCampaign'})];assert.deepEqual(buildNotifications(data,now),[]);
});

test('uma nova atribuição tem identidade própria e não reapita nas atualizações seguintes',()=>{
  const data=base();data.items=[item()];const previous=buildNotifications(data,now);
  data.items[0].assigned_at='2026-10-22T14:55:00Z';data.items[0].assigned_by='Bia';
  const next=buildNotifications(data,now);assert.equal(newlyReceived(previous.map(entry=>entry.id),next,new Set()).length,1);
  data.items[0].updated_at='2026-10-22T15:00:00Z';assert.deepEqual(buildNotifications(data,now).map(entry=>entry.id),next.map(entry=>entry.id));
});

test('comentários notificam só o responsável, sem duplicar o histórico da mesma interação',()=>{
  const data=base();data.items=[item('serviceRequests',{kind:'serviceRequest',comments:[{id:'c1',by:'Bia',text:'Pode conferir?',at:'2026-10-22T14:59:00Z'}],history:[{by:'Bia',text:'Comentário registrado: Pode conferir?',at:'2026-10-22T14:59:00Z'}]})];
  assert.equal(buildNotifications(data,now).filter(entry=>entry.category==='comment').length,1);
  data.items[0].owner='Bia';assert.equal(buildNotifications(data,now).filter(entry=>entry.category==='comment').length,0);
});

test('histórico automático não vira comentário; comentários da LIA e do acompanhamento têm tipo explícito',()=>{
  const data=base();data.items=[item('lia',{kind:'liaJourney',history:[{id:'h1',text:'Kick off realizado',at:'2026-10-22T14:50:00Z',author:'Bia'},{id:'h2',type:'Comentário',text:'Precisamos alinhar o treinamento',at:'2026-10-22T14:59:00Z',author:'Bia'}]}),{...item('cs',{kind:'csJourney',follows:[{kind:'Atualização',text:'Status de uso atualizado',createdAt:'2026-10-22T14:58:00Z',actor:'Bia'},{kind:'Comentário',text:'Conversei com o cliente',createdAt:'2026-10-22T14:59:00Z',actor:'Bia'}]}),id:'cs-2'}];
  const comments=buildNotifications(data,now).filter(entry=>entry.category==='comment');assert.equal(comments.length,2);assert.ok(comments.every(entry=>!entry.meta.includes('Kick off')&&!entry.meta.includes('Status de uso')));
});

test('comentário na ficha do cliente chega ao dono do cliente uma única vez',()=>{
  const data=base();data.customers=[{id:'customer-1',owner:'Ana'}];data.items=[{...item('customers',{comments:[{id:'c1',author:'Bia',text:'Cliente solicitou retorno',at:'2026-10-22T14:59:00Z'}]}),record_type:'Comentário do cliente',owner:'Bia',customer_id:'customer-1'}];
  assert.equal(buildNotifications(data,now).length,1);
});

test('o comentário do próprio responsável não gera aviso e editar um comentário antigo não reapita',()=>{
  const data=base();data.items=[item('commercial',{comments:[{id:'c1',author:'Ana',text:'Meu comentário',createdAt:'2026-10-22T14:00:00Z'}]})];assert.equal(buildNotifications(data,now).length,0);
  data.items[0].description=JSON.stringify({comments:[{id:'c1',author:'Bia',text:'Original',createdAt:'2026-10-22T14:00:00Z'}]});const previous=buildNotifications(data,now);
  data.items[0].description=JSON.stringify({comments:[{id:'c1',author:'Bia',text:'Editado',createdAt:'2026-10-22T14:00:00Z'}]});assert.equal(newlyReceived(previous.map(entry=>entry.id),buildNotifications(data,now),new Set()).length,0);
});

test('o vínculo de uma unidade gera uma chegada estável para o responsável pela rede',()=>{
  const data=base();data.items=[item('cs',{kind:'enterpriseNetwork',units:[{id:'unit-1',name:'Clínica A',implementationAt:'2026-10-22'}],history:[{unitId:'unit-1',type:'Cadastro de cliente',user:'Bia',createdAt:'2026-10-22T14:30:00Z'}]})];
  const entries=buildNotifications(data,now);assert.equal(entries.length,1);assert.match(entries[0].title,/Clínica A/);data.items[0].version++;
  assert.equal(newlyReceived(entries.map(entry=>entry.id),buildNotifications(data,now),new Set()).length,0);
});

test('agenda considera participantes por ID e notifica somente na janela de 30 minutos',()=>{
  const data=base();data.agendaModule={collaborators:[],commitments:[{id:'a1',title:'Alinhamento',startsAt:'2026-10-22T15:30:00Z',responsibleUserId:'bia-id',responsibleName:'Bia',participantUserIds:['ana-id'],statusName:'Agendado'}]};
  assert.equal(buildNotifications(data,now-1).length,0);assert.equal(buildNotifications(data,now).length,1);assert.equal(buildNotifications(data,now+31*60_000).length,0);
  data.agendaModule.commitments[0].statusName='Cancelado';assert.equal(buildNotifications(data,now).length,0);
});

test('lembrete só toca quando vence e reaparece uma única vez após o adiamento de 60 minutos',()=>{
  const data=base();const detail={kind:'systemReminder',title:'Retornar contato',recipientEmail:'ana@test.local',nextAlertAt:'2026-10-22T15:00:00Z'};data.items=[item('reminders',detail)];
  assert.equal(buildNotifications(data,now-1).length,0);const received=buildNotifications(data,now);assert.equal(received.length,1);
  data.items[0].description=JSON.stringify({...detail,nextAlertAt:'2026-10-22T16:00:00Z',snoozeCount:1});assert.equal(buildNotifications(data,now).length,0);
  assert.equal(newlyReceived(received.map(entry=>entry.id),buildNotifications(data,now+60*60_000),new Set()).length,1);
  data.items[0].description=JSON.stringify({...detail,seenAt:'2026-10-22T15:00:00Z'});assert.equal(buildNotifications(data,now).length,0);
});

test('mensagem enviada e fixação não geram toque, mas mensagem recebida nova gera mesmo sem subir o total',()=>{
  const data=base();const room={id:'r1',name:'Bia',unreadCount:1,lastMessageAt:'2026-10-22T14:59:00Z',messages:[{id:'m1',senderUserId:'bia-id',senderName:'Bia',body:'Olá',type:'text',createdAt:'2026-10-22T14:58:00Z'}]};data.internalChatModule.rooms=[room];const previous=buildNotifications(data,now);
  room.messages.push({id:'m2',senderUserId:'ana-id',senderName:'Ana',body:'Resposta',type:'text',createdAt:'2026-10-22T14:59:00Z'});assert.equal(newlyReceived(previous.map(entry=>entry.id),buildNotifications(data,now),new Set()).length,0);
  room.messages.push({id:'m3',senderUserId:'bia-id',senderName:'Bia',body:'Novidade',type:'text',createdAt:'2026-10-22T15:00:00Z'});assert.equal(newlyReceived(previous.map(entry=>entry.id),buildNotifications(data,now),new Set()).length,1);
});

test('tarefas ignoram alterações gerais e notificações de quem não é responsável',()=>{
  const data=base();data.taskModule={collaborators:[],tasks:[{id:'t1',assigneeUserId:'ana-id',assigneeName:'Ana'}],notifications:['updated','status_changed','priority_changed','assigned','comment_added'].map((eventType,index)=>({id:`n${index}`,taskId:'t1',eventType,message:eventType,read:false,createdAt:'2026-10-22T14:00:00Z'}))};
  assert.equal(buildNotifications(data,now).length,2);data.taskModule.tasks[0].assigneeUserId='bia-id';data.taskModule.tasks[0].assigneeName='Bia';assert.equal(buildNotifications(data,now).length,0);
});

test('salvar uma inserção própria silencia só os novos eventos do registro alterado',()=>{
  const data=base();const before=buildNotifications(data,now);data.items=[item('commercial',{comments:['Comentário sem metadados']}),{...item('lia',{kind:'liaJourney'}),id:'other-arrival'}];const after=buildNotifications(data,now);
  const muted=ownMutationNotificationIds(before,after,{id:'record-1'});assert.equal(muted.length,1);assert.equal(newlyReceived([],after,new Set(muted)).length,1);
});

test('notificações vistas não voltam ao atualizar o registro e permissões continuam respeitadas',()=>{
  const data=base();data.items=[item()];const entries=buildNotifications(data,now);assert.equal(newlyReceived([],entries,new Set(entries.map(entry=>entry.id))).length,0);
  data.user.permissions=[];assert.equal(buildNotifications(data,now).length,0);
});

test('aparência é isolada por usuário, valida cores e imagens e mantém contraste legível',()=>{
  assert.notEqual(chatAppearanceKey('ana'),chatAppearanceKey('bia'));
  const value=parseChatAppearance(JSON.stringify({receivedColor:'#ffffff',sentColor:'#005c4b',backgroundImage:'javascript:alert(1)',backgroundColor:'red; color: red'}));
  assert.equal(value.backgroundImage,'');assert.equal(value.backgroundColor,'');assert.equal(chatTextColor('#ffffff'),'#142824');assert.equal(chatTextColor('#005c4b'),'#f7fffb');
  assert.equal(chatAppearanceStyle(value)['--chat-sent'],'#005c4b');assert.equal(parseChatAppearance('{invalid').sentColor,'');
});
