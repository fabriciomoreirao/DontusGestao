import assert from 'node:assert/strict';
import test from 'node:test';
import { csDate, csTrackedDays, resumeCsJourney } from '../lib/cs-journey.ts';

const item = { created_at:'2026-10-01T20:00:00Z', updated_at:'2026-11-04T15:00:00Z' };
test('a data informada conta dias de calendário de Brasília e resiste a edições e encaminhamentos', () => {
  for (const phase of ['validation','onboarding','tracking','conference']) {
    assert.equal(csTrackedDays({phase,startDate:'2026-10-25',trackingStartedAt:'2026-11-04T12:00:00Z'}, item, Date.parse('2026-11-04T15:00:00Z')),10);
  }
  assert.equal(csTrackedDays({phase:'tracking',startDate:'2026-11-03'},item,Date.parse('2026-11-04T02:59:59Z')),0);
  assert.equal(csTrackedDays({phase:'tracking',startDate:'2026-11-03'},item,Date.parse('2026-11-04T03:00:00Z')),1);
  assert.equal(csDate('2026-11-04T02:00:00Z'),'2026-11-03');
});
test('registros antigos usam a criação estável e o encerramento congela a contagem', () => {
  assert.equal(csTrackedDays({phase:'tracking'},item,Date.parse('2026-11-04T15:00:00Z')),34);
  assert.equal(csTrackedDays({phase:'finished',startDate:'2026-10-25',conferenceConfirmedAt:'2026-10-30T18:00:00Z'},item,Date.parse('2026-11-04T15:00:00Z')),5);
  assert.equal(csTrackedDays({phase:'tracking',startDate:'2027-01-01'},item),0);
  assert.equal(csTrackedDays({phase:'tracking'}, {created_at:'inválida',updated_at:''}),0);
});
test('a retomada arquiva a data do ciclo anterior', () => {
  const resumed = resumeCsJourney({phase:'cancelled',startDate:'2026-10-01'},'2026-11-04','Ana');
  assert.equal(resumed.startDate,undefined);
  assert.equal(resumed.previousCycles[0].startDate,'2026-10-01');
});
