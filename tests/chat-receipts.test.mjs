import assert from 'node:assert/strict';
import test from 'node:test';
import {chatSeenLabel,CHAT_REACTIONS} from '../lib/chat-receipts.ts';
import {chatAppearanceStyle} from '../lib/chat-appearance.ts';

test('visualização usa data e hora de Brasília inclusive na mudança do dia',()=>{
  const now=Date.parse('2026-11-04T12:00:00Z');
  assert.equal(chatSeenLabel('2026-11-04T12:51:00Z',now),'Visualizado: hoje às 09:51');
  assert.equal(chatSeenLabel('2026-11-04T02:51:00Z',now),'Visualizado: ontem às 23:51');
  assert.equal(chatSeenLabel('2026-11-01T12:51:00Z',now),'Visualizado: 01/11/2026 às 09:51');
  assert.equal(chatSeenLabel('2026-11-04T12:51:00Z',now,2,7),'Visualizado por 2 de 7: hoje às 09:51');
  assert.equal(chatSeenLabel(null,now),'');assert.equal(chatSeenLabel('inválida',now),'');
});
test('a imagem da conversa preenche o quadro sem repetir e as reações têm opções conhecidas',()=>{
  const style=chatAppearanceStyle({backgroundColor:'',receivedColor:'',sentColor:'',backgroundImage:'data:image/png;base64,abc'});
  assert.equal(style['--chat-wallpaper-size'],'cover');assert.equal(style['--chat-wallpaper-repeat'],'no-repeat');
  assert.equal(new Set(CHAT_REACTIONS).size,CHAT_REACTIONS.length);
  assert.ok(CHAT_REACTIONS.includes('👍'));assert.ok(CHAT_REACTIONS.includes('❤️'));
});


 test('data da conversa usa Hoje, Ontem e data completa no fuso de Brasília',async()=>{
 const {chatListDateLabel}=await import('../lib/chat-receipts.ts');const now=Date.parse('2026-11-10T15:00:00Z');
 assert.equal(chatListDateLabel('2026-11-10T12:00:00Z',now),'Hoje');
 assert.equal(chatListDateLabel('2026-11-10T01:00:00Z',now),'Ontem');
 assert.equal(chatListDateLabel('2026-11-06T10:00:00Z',now),'06/11/2026');
 });
