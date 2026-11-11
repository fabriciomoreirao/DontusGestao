import assert from 'node:assert/strict';
import test from 'node:test';
import { joinComment, readCommentFiles, splitComment } from '../lib/comment-files.ts';

test('comentários conservam diferentes formatos e bytes sem misturar anexos entre mensagens', () => {
  const files = ['foto.png', 'video.mp4', 'documento.pdf', 'planilha.xlsx', 'backup.7z', 'sem-extensao'].map(name => ({
    name, type: 'application/octet-stream', size: 4, dataUrl: 'data:application/octet-stream;base64,AAEC/w=='
  }));
  const saved = joinComment('**Arquivos do cliente**\nSegundo parágrafo', files);
  assert.deepEqual(splitComment(saved), { text: '**Arquivos do cliente**\nSegundo parágrafo', files });
  assert.deepEqual(splitComment(joinComment('', files)), { text: '', files });
  assert.deepEqual(splitComment('Outro comentário'), { text: 'Outro comentário', files: [] });
});

test('anexos corrompidos são tratados como texto sem quebrar a leitura dos comentários', () => {
  for (const file of [
    { size: 4, dataUrl: 'data:application/octet-stream;base64,a===' },
    { size: -1, dataUrl: 'data:application/octet-stream;base64,AAEC/w==' },
    { size: 5, dataUrl: 'data:application/octet-stream;base64,AAEC/w==' }
  ]) {
    const saved = joinComment('Mensagem', [{ name: 'arquivo.bin', type: '', ...file }]);
    assert.deepEqual(splitComment(saved), { text: saved, files: [] });
  }
});

test('leitura recusa excesso de tamanho ou quantidade antes de carregar os arquivos', async () => {
  await assert.rejects(readCommentFiles([new File([], 'vazio.bin')]), /não vazios/);
  const large = new File(['x'], 'video.mp4');
  Object.defineProperty(large, 'size', { value: 5 * 1024 * 1024 + 1 });
  await assert.rejects(readCommentFiles([large]), /5 MB/);
  await assert.rejects(readCommentFiles(Array.from({ length: 11 }, () => new File(['x'], 'dados.json'))), /10 arquivos/);
  const total = new File(['x'], 'arquivo.zip');
  Object.defineProperty(total, 'size', { value: 4 * 1024 * 1024 });
  await assert.rejects(readCommentFiles([total, total, total, total]), /15 MB/);
});
