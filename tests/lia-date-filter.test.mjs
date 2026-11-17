import test from 'node:test';
import assert from 'node:assert/strict';
import { liaCalendarDate, liaDateFilterError, matchesLiaDates } from '../lib/lia-date-filter.ts';

const item = (detail = {}, patch = {}) => ({ status: 'Concluida', created_at: '2026-10-01T12:00:00Z', updated_at: '2026-12-20T12:00:00Z', description: JSON.stringify({ startDate: '2026-11-01', completedAt: '2026-11-17T18:00:00Z', ...detail }), ...patch });
test('datas de entrada e conclusão são inclusivas e independem de edições posteriores', () => {
  assert.equal(matchesLiaDates(item(), '2026-11-01', '2026-11-17'), true);
  assert.equal(matchesLiaDates(item(), '2026-11-02', '2026-11-17'), false);
  assert.equal(matchesLiaDates(item(), '2026-11-01', '2026-11-16'), false);
  assert.equal(matchesLiaDates(item(), '', ''), true);
});
test('data final inclui somente concluídos; data inicial permite clientes em andamento', () => {
  const open = item({}, { status: 'AcompanhamentoFinal' });
  assert.equal(matchesLiaDates(open, '2026-11-01', ''), true);
  assert.equal(matchesLiaDates(open, '', '2026-11-17'), false);
});
test('intervalo invertido ou data impossível apresenta erro e não retorna resultados', () => {
  for (const [start, end] of [['2026-11-18', '2026-11-17'], ['2026-02-30', ''], ['', 'invalida']]) {
    assert.ok(liaDateFilterError(start, end));
    assert.equal(matchesLiaDates(item(), start, end), false);
  }
  assert.equal(liaDateFilterError('2026-11-17', '2026-11-17'), '');
});
test('timestamps respeitam Brasília e registros legados recuperam criação e conclusão', () => {
  assert.equal(liaCalendarDate('2026-11-18T02:59:59Z'), '2026-11-17');
  assert.equal(liaCalendarDate('2026-11-18T03:00:00Z'), '2026-11-18');
  const legacy = item({ startDate: undefined, completedAt: undefined, history: [{ text: 'Conferência aprovada. Acompanhamento concluído.', at: '2026-11-18T02:59:59Z' }] });
  assert.equal(matchesLiaDates(legacy, '2026-10-01', '2026-11-17'), true);
  assert.equal(matchesLiaDates(legacy, '2026-10-02', '2026-11-17'), false);
});
