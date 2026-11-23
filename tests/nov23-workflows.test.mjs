import assert from 'node:assert/strict';
import test from 'node:test';
import { journeyAgendaType, findJourneyAgendaType } from '../lib/agenda-context.ts';
import { chatMentionQuery, reconcileChatMentions } from '../lib/chat-mentions.ts';
import { createChatDraftStore } from '../lib/chat-drafts.ts';
import { buildNotifications } from '../lib/notifications.ts';

test('agenda usa o tipo da etapa mesmo quando apresentação comercial é o primeiro cadastro',()=>{
  const types=[{id:'sales',name:'Apresentação comercial',active:true},{id:'meeting',name:'Reunião',active:true},{id:'training',name:'Treinamento',active:true}];
  for(const phase of ['onboarding','tracking']) {
    const name=journeyAgendaType('cs',JSON.stringify({phase}));
    assert.equal(findJourneyAgendaType(types,name)?.id,phase==='onboarding'?'training':'meeting');
  }
  assert.equal(journeyAgendaType('lia',JSON.stringify({status:'KickoffAgendado'})),'Treinamento');
  assert.equal(journeyAgendaType('tasks'),undefined);
  assert.equal(journeyAgendaType('cs','null'),'Reunião');
  assert.equal(findJourneyAgendaType(types.map(type=>({...type,active:type.id!=='training'})),'Treinamento'),undefined);
});

const body='Olá @Ana Silva, tudo bem?';
const mention={userId:'ana',name:'Ana Silva',start:4,length:10};
test('menções acompanham alterações anteriores e perdem o vínculo quando o nome é editado',()=>{
  assert.deepEqual(chatMentionQuery('Oi @An',6),{start:3,end:6,query:'An'});
  assert.equal(chatMentionQuery('ana@email',9),null);
  assert.deepEqual(reconcileChatMentions(body,'Hoje: '+body,[mention]),[{...mention,start:10}]);
  assert.deepEqual(reconcileChatMentions(body,body.replace('Ana','Bia'),[mention]),[]);
});
test('rascunhos preservam identidades ao trocar de conversa e restaurar uma falha de envio',()=>{
  const drafts=createChatDraftStore();drafts.input('user:ana',body);drafts.setMentions('user:ana',[mention]);
  const submitted=drafts.get('user:ana'),mentions=drafts.getMentions('user:ana');
  drafts.set('user:ana','');drafts.input('user:ana','Depois: '+body);drafts.setMentions('user:ana',[{...mention,start:12}]);
  drafts.move('user:ana','room');drafts.restore('room',submitted,mentions);
  assert.equal(drafts.get('room'),body+'\nDepois: '+body);
  assert.deepEqual(drafts.getMentions('room'),[mention,{...mention,start:body.length+1+12}]);
});
test('menções não lidas notificam inclusive em grupos silenciados e cessam após a leitura',()=>{
  const at='2026-11-23T12:00:00Z';
  const data={user:{email:'ana@test',displayName:'Ana',department:'Suporte',permissions:[{screen:'internalChat',canView:true}]},items:[],internalChatModule:{currentUserId:'ana',rooms:[{id:'room',name:'Suporte',isMuted:true,unreadCount:1,lastMessageAt:at,messages:[{id:'message',senderUserId:'bia',senderName:'Bia',body,type:'text',createdAt:at,isUnread:true,mentions:[mention]}]}]}};
  assert.match(buildNotifications(data,Date.parse(at))[0].title,/marcou você/);
  data.internalChatModule.rooms[0].isMuted=false;
  data.internalChatModule.rooms[0].messages.push({id:'next-message',senderUserId:'bia',senderName:'Bia',body:'Outra mensagem',type:'text',createdAt:at,isUnread:true,mentions:[]});
  assert.equal(buildNotifications(data,Date.parse(at))[0].messageId,'next-message');
  assert.doesNotMatch(buildNotifications(data,Date.parse(at))[0].title,/marcou você/);
  data.internalChatModule.rooms[0].isMuted=true;
  data.internalChatModule.rooms[0].messages[0].isUnread=false;
  assert.deepEqual(buildNotifications(data,Date.parse(at)),[]);
});
