import test from 'node:test';
import assert from 'node:assert/strict';
import {knownWorkItemVersions,mergeOperationsUpdate} from '../lib/operations-update.ts';
import {recordSearchText} from '../lib/record-search.ts';
const record=(id,version=1,updated_at='2026-11-03T12:00:00Z')=>({id,version,updated_at,title:id,description:JSON.stringify({photo:'data:image/png;base64,'+'Q'.repeat(100_000)})});

test('incremental sync preserves unchanged media and removes deleted or no longer authorized records',()=>{
 const a=record('a'),b=record('b'),hidden=record('hidden');const current={items:[a,b,hidden],user:{name:'Ana'}};
 const updated=record('b',2,'2026-11-03T14:00:00Z'),created=record('new',1,'2026-11-03T13:00:00Z');
 const next=mergeOperationsUpdate(current,{updatedItems:[updated,created],removedItemIds:['hidden']});
 assert.deepEqual(next.items.map(item=>item.id),['b','new','a']);assert.equal(next.items[2],a);assert.equal(next.items[2].description,a.description);
 assert.equal(next.user,current.user);assert.equal(current.items.length,3);
 assert.deepEqual(knownWorkItemVersions(next.items),{b:2,new:1,a:1});
});
test('empty sync keeps references, retries are idempotent, and older responses cannot replace a newer version',()=>{
 const a=record('a',3),current={items:[a]};
 assert.equal(mergeOperationsUpdate(current,{updatedItems:[],removedItemIds:[]}).items,current.items);
 const next=mergeOperationsUpdate(current,{updatedItems:[record('a',2),record('a',3)]});
 assert.equal(next.items.length,1);assert.equal(next.items[0],a);
 assert.deepEqual(mergeOperationsUpdate(next,{updatedItems:[a]}).items,next.items);
});
test('legacy full snapshots still replace the authorized set and partial task updates retain work items',()=>{
 const current={items:[record('old')],taskModule:{tasks:[]}};
 const visible=[record('visible')];assert.equal(mergeOperationsUpdate(current,{items:visible}).items,visible);
 assert.equal(mergeOperationsUpdate(current,{taskModule:{tasks:['new-task']}}).items,current.items);
});
test('record searches retain accented descriptions and filenames without indexing binary attachment bytes',()=>{
 const item={title:'Clínica São José',customer_name:'123456',record_type:'Solicitação',description:JSON.stringify({summary:'Retenção e implantação',name:'contrato.pdf',dataUrl:'data:application/pdf;base64,'+'QUJD'.repeat(500_000)})};
 const text=recordSearchText(item);assert.ok(text.includes('retencao e implantacao'));assert.ok(text.includes('contrato.pdf'));assert.ok(text.includes('clinica sao jose'));assert.ok(text.length<250);assert.equal(recordSearchText(item),text);
});
