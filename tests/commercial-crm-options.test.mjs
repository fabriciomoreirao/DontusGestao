import test from 'node:test';
import assert from 'node:assert/strict';
import {crmLossReasonCatalog,crmLossReasons,matchesCrmProduct} from '../lib/commercial-crm-options.ts';

test('motivos herdados podem ser alterados ou desativados em um CRM sem afetar os demais',()=>{
 const legacy={id:'legacy',catalog:'lossReason',name:'Preço',description:'',active:true};
 const override={...legacy,id:'own',catalog:crmLossReasonCatalog('crm-A'),active:false};
 const own={...legacy,id:'custom',name:'Sem interesse',catalog:crmLossReasonCatalog('crm-A')};
 assert.equal(crmLossReasons([legacy,override,own],'crm-A').filter(reason=>reason.active).length,1);
 assert.deepEqual(crmLossReasons([legacy,override,own],'crm-B').map(reason=>[reason.name,reason.active,reason.inherited]),[['Preço',true,true]]);
 assert.equal(legacy.catalog,'lossReason');assert.equal(legacy.active,true);
 const renamed={...override,name:'Orçamento',description:JSON.stringify({inheritedName:'Preço'}),active:true};
 assert.deepEqual(crmLossReasons([legacy,renamed],'crm-A').map(reason=>reason.name),['Orçamento']);
 assert.deepEqual(crmLossReasons([legacy,renamed],'crm-B').map(reason=>reason.name),['Preço']);
 assert.match(crmLossReasonCatalog('a1-b2'),/^commercialLossReason_[a-zA-Z0-9]+$/);
});
test('filtra os produtos efetivamente vinculados ao card e preserva a opção todos',()=>{
 assert.equal(matchesCrmProduct([{product:'Dontus',quantity:2}],'Dontus'),true);
 assert.equal(matchesCrmProduct([{product:'LIA'}],'Dontus'),false);
 assert.equal(matchesCrmProduct(undefined,'Dontus'),false);
 assert.equal(matchesCrmProduct(undefined,'all'),true);
});
