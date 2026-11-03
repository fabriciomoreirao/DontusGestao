import assert from 'node:assert/strict';
import test from 'node:test';
import { assignmentPerson } from '../lib/assignment-people.ts';

const people = [
  { id: 'ana-support', email: 'ana.support@test.local', displayName: 'Ana Silva' },
  { id: 'ana-sales', email: 'ana.sales@test.local', displayName: 'Ana Silva' },
  { id: 'natalia', email: 'natalia@test.local', displayName: 'Natália Souza' },
];

test('identifica o próprio responsável pelo e-mail mesmo com nome repetido ou desatualizado', () => {
  assert.equal(assignmentPerson(people, { email: ' ANA.SALES@test.local ', displayName: 'Ana' })?.id, 'ana-sales');
  assert.equal(assignmentPerson(people, { email: 'natalia@test.local', displayName: 'Outro nome' })?.id, 'natalia');
  assert.equal(assignmentPerson(people, { email: 'ausente@test.local', displayName: 'Natália Souza' }), undefined);
});

test('recupera um atendimento antigo salvo apenas com nome quando há uma única correspondência', () => {
  assert.equal(assignmentPerson(people, { displayName: ' natalia SOUZA ' })?.id, 'natalia');
  assert.equal(assignmentPerson(people, { displayName: 'Ana Silva' }), undefined);
  assert.equal(assignmentPerson(people, {}), undefined);
});

test('preserva a identidade salva sem atribuir a outra pessoa com o mesmo nome', () => {
  assert.equal(assignmentPerson(people, { id: 'ana-support', displayName: 'Ana Silva' })?.email, 'ana.support@test.local');
  assert.equal(assignmentPerson(people, { id: 'removed', displayName: 'Natália Souza' }), undefined);
});
