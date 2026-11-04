import assert from 'node:assert/strict';
import test from 'node:test';
import {directSaleClientId,directSaleFollowup} from '../lib/direct-sale-routing.ts';

for (const followUpTrack of ['activation','retention','lia']) test(`envia o ID do cliente e os dados da venda para ${followUpTrack}`,()=>{
  const sale={clientId:'123456',saleId:'260001',saleDate:'2026-11-04',name:'Clínica teste',seller:'Ana',followUpTrack,version:'Completo',origin:'Indicação',products:[{product:'Dontus',plan:'Completo',unitValue:200,quantity:2}],totalCents:40000};
  const routed=directSaleFollowup(sale,'sale-record','2026-11-04T12:00:00Z','history-id');
  assert.equal(routed.clientId,'123456');assert.notEqual(routed.clientId,sale.saleId);
  assert.equal(routed.saleId,'260001');assert.equal(routed.sourceLeadId,'sale-record');
  assert.equal(routed.version,sale.version);assert.deepEqual(routed.products,sale.products);
  assert.equal(routed.origin,sale.origin);assert.equal(routed.seller,sale.seller);assert.equal(routed.totalCents,sale.totalCents);
  assert.equal(routed.kind,followUpTrack==='lia'?'liaJourney':'csJourney');
  assert.equal('leadQualification' in routed,false);
  const history=followUpTrack==='lia'?routed.history:routed.follows;
  assert.match(history[0].text,/123456/);assert.match(history[0].text,/Completo/);
});
test('o ID da unidade estratégica usa o cliente e registros legados continuam legíveis',()=>{
  assert.equal(directSaleClientId({clientId:' 123456 ',saleId:'260001'}),'123456');
  assert.equal(directSaleClientId({saleId:'260001'}),'260001');
});
