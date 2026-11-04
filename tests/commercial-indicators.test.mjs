import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialIndicatorFlow,scopeCommercialIndicatorItems} from '../lib/commercial-indicators.ts';

test('CRM Comercial e Retenção têm indicadores distintos mesmo usando o mesmo kind',()=>{
  const item=(id,record_type,amount,detail={})=>({id,module:'commercial',record_type,amount,description:JSON.stringify({kind:'commercialLead',...detail})});
  const items=[item('crm','Lead comercial',100),item('retention','Lead de retenção',900),
    item('qualification','Lead de qualificação',50),item('sale-crm','Venda direta comercial',200,{kind:'directSale',flow:'crm',followUpTrack:'retention'}),
    item('sale-retention','Venda direta de retenção',800,{kind:'directSale',flow:'retention'}),
    {...item('another-module','Lead comercial',5000),module:'cs'}];
  const crm=scopeCommercialIndicatorItems(items,'commercial:crm:evolution:retentionSettings');
  const retention=scopeCommercialIndicatorItems(items,'commercial:retention:onboarding:collaborators');
  assert.deepEqual(crm.map(item=>item.id),['crm','sale-crm']);
  assert.deepEqual(retention.map(item=>item.id),['retention','sale-retention']);
  assert.equal(crm.reduce((sum,item)=>sum+item.amount,0),300);
  assert.equal(retention.reduce((sum,item)=>sum+item.amount,0),1700);
  assert.deepEqual(scopeCommercialIndicatorItems(items,'commercial:qualification:onboarding:collaborators').map(item=>item.id),['qualification']);
});

test('a classificação acompanha o tipo do card e aceita fluxos legados sem confundir destino com CRM',()=>{
  const item={module:'commercial',record_type:'CRM retenção',description:'{"kind":"commercialLead","flow":"crm"}'};
  assert.equal(commercialIndicatorFlow(item),'retention');
  assert.equal(commercialIndicatorFlow({...item,record_type:'Oportunidade',description:'{"kind":"directSale","crmFlow":"retention"}'}),'retention');
  assert.equal(commercialIndicatorFlow({...item,record_type:'Oportunidade',description:'{"kind":"commercialLead","followUpTrack":"retention"}'}),'crm');
  assert.equal(commercialIndicatorFlow({...item,record_type:'Oportunidade',description:'registro legado'}),'crm');
});
