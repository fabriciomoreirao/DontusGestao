import assert from 'node:assert/strict';import test from 'node:test';
import {reminderRecipients} from '../lib/assignment-people.ts';
import {isCommentSubmitKey} from '../lib/comment-enter.ts';
import {applyChatPresence,userIsOnline} from '../lib/chat-presence.ts';
import {waitingQueueNeedsContact} from '../lib/waitingQueue.ts';
import {buildNotifications} from '../lib/notifications.ts';
import {unlockNotificationSound,playNotificationSound} from '../lib/notification-sound.ts';

const self={id:'ana',email:'ana@example.test',displayName:'Ana',active:true,departmentId:'support',departmentIds:['support','cs'],departmentName:'Suporte',departmentNames:['Suporte','Sucesso do Cliente']};
const user={email:self.email,displayName:self.displayName,department:self.departmentName,permissions:[{screen:'waitingQueue',canView:true}]};
const peer={...self,id:'bia',email:'bia@example.test',displayName:'Bia',departmentId:'cs',departmentIds:['cs'],departmentName:'sucesso do cliente',departmentNames:[]};
test('lembretes incluem o próprio usuário e colaboradores de seus setores sem usar dados administrativos',()=>{
  const other={...peer,id:'sales',email:'sales@example.test',departmentId:'sales',departmentIds:['sales'],departmentName:'Comercial'};
  const inactive={...self,id:'inactive',active:false},blocked={...self,id:'blocked',blockedAt:'2026-11-03T10:00:00Z'};
  assert.deepEqual(reminderRecipients([self,peer,other,inactive,blocked],user).map(person=>person.id),['ana','bia']);
});
test('Enter envia; Shift, composição de caracteres e repetição de tecla preservam a edição',()=>{
  const event={key:'Enter',shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,isComposing:false,repeat:false};
  assert.equal(isCommentSubmitKey(event),true);
  for(const flag of ['shiftKey','ctrlKey','altKey','metaKey','isComposing','repeat'])assert.equal(isCommentSubmitKey({...event,[flag]:true}),false,flag);
  assert.equal(isCommentSubmitKey({...event,keyCode:229}),false);
});
test('a presença altera somente os usuários e expira após a perda de conexão',()=>{
  const module={users:[{id:'ana',name:'Ana'}],rooms:[{id:'private-room'}]};const now=Date.parse('2026-11-03T12:00:00Z');
  const updated=applyChatPresence(module,[{userId:'ana',isOnline:true,lastSeenAt:new Date(now).toISOString()}]);
  assert.equal(updated.rooms,module.rooms);assert.equal(userIsOnline(updated.users[0],now),true);assert.equal(userIsOnline(updated.users[0],now+76000),false);
  assert.equal(applyChatPresence(updated,[{userId:'ana',isOnline:true,lastSeenAt:new Date(now).toISOString()}]),updated);
});
const queue=(sector='support',responsible='')=>({id:'queue',module:'waitingQueue',title:'Clínica',owner:'Remetente de outro setor',team:sector==='support'?'Suporte':'Comercial',record_type:'Encaminhamento',created_by:'sender@example.test',created_at:'2026-11-03T11:00:00Z',updated_at:'2026-11-03T11:00:00Z',description:JSON.stringify({kind:'waitingQueue',state:'waiting',departmentId:sector,departmentName:sector==='support'?'Suporte':'Comercial',responsibleUserId:responsible,responsibleName:''})});
test('fila compartilhada conta e notifica só o setor de destino, mesmo que o proprietário seja o remetente',()=>{
  const own=queue(),other=queue('sales'),assignedElsewhere=queue('support','bia');
  assert.equal(waitingQueueNeedsContact(own,user,[self]),true);assert.equal(waitingQueueNeedsContact(other,user,[self]),false);assert.equal(waitingQueueNeedsContact(assignedElsewhere,user,[self]),false);
  const data={user,items:[own],waitingQueueDirectory:{employees:[self]}};
  assert.equal(buildNotifications(data,Date.now()).length,1);assert.equal(buildNotifications({...data,items:[other]},Date.now()).length,0);
  assert.equal(buildNotifications({...data,items:[{...own,description:JSON.stringify({...JSON.parse(own.description),state:'contacted'})}]},Date.now()).length,0);
});
test('o alerta sonoro reutiliza o áudio liberado pela interação do usuário',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');let created=0,resumed=0,notes=0;
  class Audio{
    state='suspended';currentTime=0;destination={};constructor(){created++;}
    async resume(){resumed++;this.state='running';}
    createOscillator(){return{frequency:{},connect:gain=>gain,start:()=>notes++,stop:()=>{},disconnect:()=>{}};}
    createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},disconnect(){}};}
  }
  Object.defineProperty(globalThis,'window',{configurable:true,value:{AudioContext:Audio}});
  try{unlockNotificationSound();await Promise.resolve();playNotificationSound(true);playNotificationSound(false);assert.equal(created,1);assert.equal(resumed,1);assert.equal(notes,5);}
  finally{if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;}
});
