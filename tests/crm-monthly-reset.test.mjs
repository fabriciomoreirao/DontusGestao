import test from 'node:test';
import assert from 'node:assert/strict';
import {crmMonthNumber,visibleAfterMonthlyReset} from '../lib/crm-monthly-reset.ts';
import {scopeCommercialIndicatorItems,commercialSaleDate} from '../lib/commercial-indicators.ts';

const old={created_at:'2026-10-10T15:00:00Z'},current={created_at:'2026-11-01T03:00:00Z'};
const stage={resetMonthly:true,resetMonthlySince:202610};
test('a coluna zera exatamente na virada do mês de Brasília, preservando a etapa sem flag',()=>{
 assert.equal(crmMonthNumber('2026-11-01T02:59:59Z'),202610);
 assert.equal(visibleAfterMonthlyReset(old,null,stage,Date.parse('2026-11-01T02:59:59Z')),true);
 assert.equal(visibleAfterMonthlyReset(old,null,stage,Date.parse('2026-11-01T03:00:00Z')),false);
 assert.equal(visibleAfterMonthlyReset(old,null,{resetMonthly:false},Date.parse('2026-11-01T03:00:00Z')),true);
 assert.equal(visibleAfterMonthlyReset(current,null,stage,Date.parse('2026-11-01T03:00:00Z')),true);
});
test('ativar a flag começa na próxima virada e janeiro também limpa dezembro',()=>{
 assert.equal(visibleAfterMonthlyReset(old,null,{resetMonthly:true,resetMonthlySince:202611},Date.parse('2026-11-12T15:00:00Z')),true);
 assert.equal(visibleAfterMonthlyReset({created_at:'2026-12-01T15:00:00Z'},null,{resetMonthly:true,resetMonthlySince:202612},Date.parse('2027-01-01T03:00:00Z')),false);
});
test('movimentar um card para a etapa no mês atual mantém o card; comentar não altera sua competência',()=>{
 const now=Date.parse('2026-11-12T15:00:00Z');
 assert.equal(visibleAfterMonthlyReset(old,{stageEnteredAt:'2026-11-02T15:00:00Z'},stage,now),true);
 assert.equal(visibleAfterMonthlyReset(old,{stageEnteredAt:'2026-10-02T15:00:00Z',follows:[{type:'Contato',createdAt:'2026-11-12T15:00:00Z'}]},stage,now),false);
 assert.equal(visibleAfterMonthlyReset(old,{follows:[{type:'Movimentação',createdAt:'2026-11-02T15:00:00Z'}]},stage,now),true);
 assert.equal(visibleAfterMonthlyReset(old,{follows:[{type:'Contato',createdAt:'2026-11-02T15:00:00Z'}]},stage,now),false);
});
test('o consolidado inclui todos os funis comerciais e vendas diretas sem misturar retenção',()=>{
 const item=(id,record_type,funnel,kind='commercialLead')=>({id,module:'commercial',record_type,description:JSON.stringify({kind,funnel})});
 const items=[item('a','Lead comercial','Alpha'),item('b','Lead comercial','Beta'),item('q','Lead de qualificação','Tráfego'),item('d','Venda direta','','directSale'),item('r','Lead de retenção','Retenção')];
 assert.deepEqual(scopeCommercialIndicatorItems(items,'commercial:combined').map(item=>item.id),['a','b','q','d']);
 assert.equal(items.length,5);
});
test('a competência da venda considera a data de ganho em Brasília e a data informada na venda direta',()=>{
 assert.equal(commercialSaleDate({wonAt:'2026-11-01T02:59:59Z'},'2026-09-10'),'2026-10-31');
 assert.equal(commercialSaleDate({wonAt:'2026-11-01T03:00:00Z'},'2026-09-10'),'2026-11-01');
 assert.equal(commercialSaleDate({saleDate:'2026-11-12',wonAt:'2026-10-31T00:00:00Z'},''),'2026-11-12');
});
