import assert from 'node:assert/strict';
import test from 'node:test';
import { createRealtimeSync } from '../lib/realtime-sync.ts';

function setup(t, overrides = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const state = { operations: 0, chat: 0, hidden: false, busy: false, unauthorized: 0, status: false, sockets: [] };
  const sync = createRealtimeSync({ url: 'ws://localhost/api/realtime', cursor: () => 'instance:1',
    canChat: true, hidden: () => state.hidden, busy: () => state.busy,
    status: value => { state.status = value; }, unauthorized: () => { state.unauthorized++; },
    operations: async () => { state.operations++; return true; }, chat: async () => { state.chat++; return true; },
    connect: () => {
      const socket = { close() { this.closed = true; this.onclose?.({}); }, message(message) { this.onmessage?.({ data: JSON.stringify(message) }); } };
      state.sockets.push(socket); return socket;
    }, ...overrides });
  t.after(() => sync.stop());
  state.sockets[0].message({ type: 'ready', cursor: 'instance:1' });
  const tick = async ms => { t.mock.timers.tick(ms); await new Promise(resolve => process.nextTick(resolve)); };
  return { state, sync, tick, socket: state.sockets[0] };
}

test('uma conexão saudável permanece sem polling e sem repetir a carga inicial', async t => {
  const { state, socket, tick, sync } = setup(t);
  for (let i = 0; i < 5; i++) { await tick(25_000); socket.message({ type: 'heartbeat' }); }
  sync.visible(); await tick(1000);
  assert.equal(state.status, true); assert.equal(state.operations, 0); assert.equal(state.chat, 0);
});

test('presença atualiza o chat sem GET ou recarga de operações, inclusive durante uma edição',async t=>{
  const received=[];const{state,socket,tick}=setup(t,{presence:users=>received.push(users)});state.busy=true;
  socket.message({type:'changed',presence:[{userId:'ana',isOnline:true,lastSeenAt:'2026-11-03T12:00:00Z'}]});await tick(1000);
  assert.equal(received.length,1);assert.equal(received[0][0].isOnline,true);assert.equal(state.chat,0);assert.equal(state.operations,0);
});
test('rajadas são agrupadas e chat e operação atualizam sem esperar um pelo outro', async t => {
  const { state, socket, tick } = setup(t);
  for (let i = 0; i < 40; i++) socket.message({ type: 'changed', internalChat: true });
  await tick(300); assert.equal(state.chat, 1); assert.equal(state.operations, 0);
  socket.message({ type: 'changed', internalChat: true }); socket.message({ type: 'changed', operations: true });
  await tick(300); assert.equal(state.chat, 2); assert.equal(state.operations, 1);
});
test('uma mutation em curso adia a recarga sem perder eventos', async t => {
  const { state, socket, tick } = setup(t); state.busy = true;
  socket.message({ type: 'changed', operations: true }); await tick(300); assert.equal(state.operations, 0);
  state.busy = false; await tick(1000); assert.equal(state.operations, 1);
});
test('em segundo plano só novas mensagens baixam o chat; a operação aguarda visibilidade', async t => {
  const { state, socket, tick, sync } = setup(t); state.hidden = true;
  socket.message({ type: 'changed', operations: true, internalChat: true }); await tick(300);
  assert.equal(state.operations, 0); assert.equal(state.chat, 1);
  state.hidden = false; sync.visible(); await tick(300); assert.equal(state.operations, 1);
});
test('reconectar recupera alterações perdidas e a limpeza cancela reconexões', async t => {
  const { state, socket, tick, sync } = setup(t); socket.close(); await tick(1500);
  assert.equal(state.sockets.length, 2); state.sockets[1].message({ type: 'ready', cursor: 'instance:1' });
  await tick(300); assert.equal(state.operations, 1); assert.equal(state.chat, 1);
  sync.stop(); await tick(120_000); assert.equal(state.sockets.length, 2);
});
test('invalidação durante um GET gera uma segunda atualização, sem GETs simultâneos', async t => {
  let finish; let calls = 0;
  const { socket, tick } = setup(t, { operations: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  socket.message({ type: 'changed', operations: true }); await tick(300); assert.equal(calls, 1);
  socket.message({ type: 'changed', operations: true }); await tick(300); assert.equal(calls, 1);
  finish(true); await tick(0); await tick(300); assert.equal(calls, 2); finish(true);
});
test('falha HTTP mantém a invalidação pendente para nova tentativa', async t => {
  let calls = 0;
  const { socket, tick } = setup(t, { operations: async () => ++calls > 1 });
  socket.message({ type: 'changed', operations: true }); await tick(300); assert.equal(calls, 1);
  await tick(5000); assert.equal(calls, 2);
});
test('mensagens chegam em até 75 ms mesmo com formulário salvando ou snapshot lento', async t => {
  let finish;
  const { state, socket, tick } = setup(t, { operations: () => new Promise(resolve => { finish = resolve; }) });
  state.busy = true;
  socket.message({ type: 'changed', operations: true, internalChat: true });
  await tick(75); assert.equal(state.chat, 1);
  state.busy = false; await tick(1000);
  socket.message({ type: 'changed', internalChat: true }); await tick(75);
  assert.equal(state.chat, 2); finish(true); await tick(0);
});
test('eventos durante uma consulta de chat são recuperados sem consultas de chat simultâneas', async t => {
  let finish; let calls = 0;
  const { socket, tick } = setup(t, { chat: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  socket.message({ type: 'changed', internalChat: true }); await tick(75);
  socket.message({ type: 'changed', internalChat: true }); await tick(75); assert.equal(calls, 1);
  finish(true); await tick(0); await tick(75); assert.equal(calls, 2); finish(true);
});
test('sessão encerrada cancela a conexão e não tenta reconectar', async t => {
  const { state, socket, tick } = setup(t); socket.message({ type: 'unauthorized' });
  await tick(120_000); assert.equal(state.unauthorized, 1); assert.equal(state.sockets.length, 1);
});
test('recuperação HTTP fica limitada ao período sem socket', async t => {
  const { state, socket, tick } = setup(t); socket.close();
  await tick(15_000); await tick(300); assert.equal(state.operations, 0); assert.equal(state.chat, 1);
  await tick(45_000); await tick(300); assert.equal(state.operations, 1);
});
