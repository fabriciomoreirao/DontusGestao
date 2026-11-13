import test from 'node:test';
import assert from 'node:assert/strict';
import { moveLiaQuestion, validateLiaFiles, liaFileLimits } from '../lib/lia-form-fields.ts';

test('question reordering preserves IDs, options, required flags and the original array', () => {
  const first = { id: 'a', type: 'select', required: true, options: ['Sim', 'Não'] };
  const second = { id: 'b', type: 'file', required: false };
  const original = [first, second];
  assert.deepEqual(moveLiaQuestion(original, 0, 1), [second, first]);
  assert.deepEqual(moveLiaQuestion(original, 1, -1), [second, first]);
  assert.deepEqual(original, [first, second]);
  assert.deepEqual(moveLiaQuestion(original, 0, -1), original);
  assert.deepEqual(moveLiaQuestion(original, 1, 1), original);
});

test('file validation accepts PDFs, photos, videos and optional empty groups', () => {
  assert.equal(validateLiaFiles([{ questionId: 'files', files: [{ name: 'dados.pdf', size: 1024 }, { name: 'foto.jpg', size: 2048 }, { name: 'video.mp4', size: liaFileLimits.perFile }] }, { questionId: 'optional', files: [] }]), '');
});

test('upload limits apply per question and across the whole form', () => {
  const file = { name: 'documento.pdf', size: 1 };
  assert.match(validateLiaFiles([{ questionId: 'a', files: Array(11).fill(file) }]), /10 arquivos/);
  assert.match(validateLiaFiles(['a', 'b', 'c'].map(questionId => ({ questionId, files: Array(7).fill(file) }))), /20 arquivos/);
  assert.match(validateLiaFiles([{ questionId: 'a', files: [{ ...file, size: 0 }] }]), /vazio/);
  assert.match(validateLiaFiles([{ questionId: 'a', files: [{ ...file, size: liaFileLimits.perFile + 1 }] }]), /50 MB/);
  assert.match(validateLiaFiles([{ questionId: 'a', files: Array(3).fill({ ...file, size: liaFileLimits.perFile }) }]), /100 MB/);
});
