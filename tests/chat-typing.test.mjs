import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatTypingPublisher,createChatTypingStore,CHAT_TYPING_TTL} from '../lib/chat-typing.ts';

const update=(patch={})=>({roomId:'room',userId:'ana',sessionId:'tab',isTyping:true,at:new Date().toISOString(),...patch});
const tick=async(t,ms)=>{t.mock.timers.tick(ms);await new Promise(resolve=>process.nextTick(resolve));};

test('digitação transmite início, pulsos limitados e pausa sem um envio por caractere',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout']});const sent=[];
 const publisher=createChatTypingPublisher(async active=>sent.push(active));t.after(()=>publisher.dispose());
 for(let i=0;i<60;i++){publisher.input(true);await tick(t,50)}
 assert.deepEqual(sent,[true]);publisher.input(true);await tick(t,0);assert.deepEqual(sent,[true,true]);
 await tick(t,1400);await tick(t,0);assert.deepEqual(sent,[true,true,false]);
});
test('pausa e troca de conversa aguardam um envio lento e mantêm a ordem sem bloquear a entrada',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout']});let finish;const sent=[];
 const publisher=createChatTypingPublisher(active=>{sent.push(active);return new Promise(resolve=>finish=resolve)});
 publisher.input(true);await tick(t,0);publisher.stop();await tick(t,0);assert.deepEqual(sent,[true]);
 finish();await tick(t,0);assert.deepEqual(sent,[true,false]);finish();publisher.dispose();
});
test('sinais por conversa expiram e só o indicador recebe atualizações quando o estado visual muda',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout']});const store=createChatTypingStore();t.after(()=>store.clear());let renders=0;store.subscribe(()=>renders++);
 store.receive([update()]);assert.deepEqual(store.users('room','self'),['ana']);assert.deepEqual(store.users('room','ana'),[]);assert.deepEqual(store.users('other','self'),[]);
 await tick(t,2000);store.receive([update()]);assert.equal(renders,1);
 await tick(t,CHAT_TYPING_TTL-1);assert.deepEqual(store.users('room','self'),['ana']);await tick(t,1);assert.deepEqual(store.users('room','self'),[]);assert.equal(renders,2);
});
test('abas independentes, eventos atrasados e sinais inválidos não deixam digitando preso',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout']});const store=createChatTypingStore();t.after(()=>store.clear());const first=update();store.receive([first]);
 await tick(t,10);store.receive([update({sessionId:'tab2'})]);await tick(t,10);store.receive([update({isTyping:false})]);assert.deepEqual(store.users('room','self'),['ana']);
 store.receive([first,{roomId:'bad'},null]);assert.deepEqual(store.users('room','self'),['ana']);
 await tick(t,10);store.receive([update({sessionId:'tab2',isTyping:false})]);assert.deepEqual(store.users('room','self'),[]);
});

test('parar de digitar prevalece mesmo com início e fim no mesmo milissegundo',t=>{
 t.mock.timers.enable({apis:['Date','setTimeout']});const store=createChatTypingStore();t.after(()=>store.clear());const start=update();store.receive([start]);store.receive([{...start,isTyping:false}]);store.receive([start]);assert.deepEqual(store.users('room','self'),[]);
});
