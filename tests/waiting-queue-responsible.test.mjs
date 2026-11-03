import assert from 'node:assert/strict';
import test from 'node:test';
import {belongsToWaitingQueueDepartment} from '../lib/waitingQueue.ts';

test('responsible choices include primary and secondary sectors and legacy sector names',()=>{
  const support={departmentId:'support',departmentName:'Suporte'};
  assert.equal(belongsToWaitingQueueDepartment({departmentId:'support'},support),true);
  assert.equal(belongsToWaitingQueueDepartment({departmentId:'sales',departmentIds:['sales','support']},support),true);
  assert.equal(belongsToWaitingQueueDepartment({departmentName:' suporte '},support),true);
  assert.equal(belongsToWaitingQueueDepartment({departmentNames:['SUPORTE']},support),true);
  assert.equal(belongsToWaitingQueueDepartment({departmentId:'sales',departmentName:'Comercial'},support),false);
});

test('missing department IDs do not place unrelated people in the same shared queue',()=>{
  assert.equal(belongsToWaitingQueueDepartment({departmentId:null,departmentName:'Comercial'},{departmentId:'',departmentName:'Suporte'}),false);
  assert.equal(belongsToWaitingQueueDepartment({departmentId:null,departmentName:''},{departmentId:'',departmentName:''}),false);
  assert.equal(belongsToWaitingQueueDepartment({departmentName:'Sucesso do Cliente'},{departmentId:'legacy',departmentName:' SUCESSO DO CLIENTE '}),true);
});
