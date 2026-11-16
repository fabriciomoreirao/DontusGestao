import test from 'node:test';import assert from 'node:assert/strict';
import {goalChartData} from '../lib/goal-charts.ts';
import {goalProgressRevision} from '../lib/goal-progress-request.ts';
const goal={id:'a',title:'Meta',metric:'salesValue',target:1000,actual:650,progress:65,achieved:false,periodStart:'2026-11-05',periodEnd:'2026-11-30',history:[{date:'2026-11-05',actual:100},{date:'2026-11-13',actual:650}]};
test('goal charts keep past launches, leave future actuals blank, and show the full objective horizon',()=>{
 const chart=goalChartData(goal);assert.equal(chart.history.length,2);assert.equal(chart.x('2026-11-05'),0);assert.equal(chart.x('2026-11-30'),1);assert.ok(chart.x('2026-11-13')<1);assert.equal(chart.expected('2026-11-30'),1000);assert.equal(chart.remaining,350);assert.equal(chart.achievedOn,undefined);
});
test('achievement, overachievement, one-day goals and zero movement have finite chart geometry',()=>{
 const chart=goalChartData({...goal,actual:1200,history:[...goal.history,{date:'2026-11-14',actual:1200}]});assert.equal(chart.remaining,0);assert.equal(chart.achievedOn,'2026-11-14');assert.ok(chart.max>1200);
 const daily=goalChartData({...goal,periodEnd:goal.periodStart,actual:0,history:[{date:goal.periodStart,actual:0}]});assert.equal(daily.x(goal.periodStart),0.5);assert.equal(daily.expected(goal.periodStart),1000);assert.ok(Number.isFinite(daily.max));
});
test('history discards invalid/out-of-period points without dropping legitimate zero values',()=>{
 const chart=goalChartData({...goal,history:[{date:'2026-11-04',actual:200},{date:'2026-12-01',actual:300},{date:'bad',actual:8},{date:'2026-11-07',actual:NaN},{date:'2026-11-05',actual:0}]});assert.deepEqual(chart.history,[{date:'2026-11-05',actual:0}]);
});
test('recalculation reacts to historical sources and new goals, and ignores chat/task updates',()=>{
 const base=[{id:'goal',module:'goals',version:1},{id:'sale',module:'commercial',version:1}];const key=goalProgressRevision(base);assert.equal(goalProgressRevision([...base].reverse()),key);assert.equal(goalProgressRevision([...base,{id:'chat',module:'internalChat',version:8},{id:'task',module:'tasks',version:4}]),key);assert.notEqual(goalProgressRevision([...base,{id:'old-referral',module:'referrals',version:1}]),key);assert.notEqual(goalProgressRevision([{...base[0],version:2},base[1]]),key);
});
