import assert from 'node:assert/strict';
import test from 'node:test';
import {formatGoalValue,goalTargetError,goalTargetKind,parseGoalTarget} from '../lib/goal-target.ts';

test('metas usam moeda, porcentagem e quantidades inteiras conforme o tipo',()=>{
  assert.equal(goalTargetKind('salesValue'),'money');assert.equal(goalTargetKind('usageScore'),'percentage');
  for(const metric of ['salesCount','referralCount']){
    assert.equal(goalTargetKind(metric),'integer');assert.ok(goalTargetError(1.5,metric));assert.equal(goalTargetError(21,metric),'');
    assert.equal(formatGoalValue(1234,metric),'1.234');assert.equal(parseGoalTarget('1.234',metric),1234);
  }
  assert.equal(parseGoalTarget('R$ 1.234,56'),1234.56);assert.equal(parseGoalTarget('80,5%','usageScore'),80.5);
  assert.equal(formatGoalValue(85.5,'usageScore'),'85,5%');assert.match(formatGoalValue(1234.56,'salesValue'),/1\.234,56/);
  assert.equal(goalTargetError(100,'usageScore'),'');assert.ok(goalTargetError(100.1,'usageScore'));
  assert.ok(goalTargetError(0,'salesValue'));assert.ok(goalTargetError(12.3456,'salesValue'));assert.ok(goalTargetError(NaN,'salesCount'));
  for(const value of ['abc','1,2,3','-1','1e4',''])assert.ok(Number.isNaN(parseGoalTarget(value)));
});
