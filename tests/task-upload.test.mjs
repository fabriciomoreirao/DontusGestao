import assert from 'node:assert/strict';
import test from 'node:test';
import { TASK_FILE_BYTES, taskUploadBatches, sendTaskFiles } from '../lib/task-upload.ts';

test('aceita documentos, planilhas, imagens e compactados e respeita 25 MB por lote', () => {
  const files = ['relatorio.pdf','planilha.xlsx','texto.docx','dados.csv','foto.png','backup.zip','arte.svg','pagina.html','arquivo.sem-formato'].map(name => ({ name, size: 10 * 1024 * 1024 }));
  const batches = taskUploadBatches(files);
  assert.deepEqual(batches.flat(), files); assert.equal(batches.length, 5);
  assert.ok(batches.every(batch => batch.reduce((size,file) => size+file.size,0) <= TASK_FILE_BYTES));
});

test('recusa arquivos vazios, acima do limite e mais de dez antes de enviar', async t => {
  const fetch = t.mock.method(globalThis,'fetch',()=>{throw Error('Unexpected upload');});
  for (const files of [[{name:'vazio.pdf',size:0}], [{name:'grande.pdf',size:TASK_FILE_BYTES+1}],
    Array.from({length:11},()=>({name:'arquivo.pdf',size:10}))])
    await assert.rejects(sendTaskFiles('task',files));
  assert.equal(fetch.mock.callCount(),0);
});

test('envia bytes e nome dos documentos, vinculando os anexos ao comentário correto',async t=>{
  const file = new File(['spreadsheet-content'],'procedimentos.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(new URL(url,'http://localhost').searchParams.get('taskId'),'task/id');
    assert.equal(new URL(url,'http://localhost').searchParams.get('commentId'),'comment/id');
    const [sent] = options.body.getAll('files'); assert.equal(sent.name,file.name); assert.equal(await sent.text(),'spreadsheet-content');
    return Response.json({ids:['id']},{status:201});
  });
  const sent=[]; await sendTaskFiles('task/id',[file],'comment/id',batch=>sent.push(...batch));
  assert.deepEqual(sent,[file]);
});

test('falhas mantêm só os arquivos pendentes e não enviam os lotes seguintes',async t=>{
  const files=['a','b','c'].map(name=>new File([name],`${name}.pdf`));
  files.forEach(file=>Object.defineProperty(file,'size',{value:TASK_FILE_BYTES}));
  let calls=0;const sent=[];
  t.mock.method(globalThis,'fetch',async()=>++calls===1?Response.json({ids:['a']},{status:201}):Response.json({detail:'Falha temporária'},{status:503}));
  await assert.rejects(sendTaskFiles('task',files,undefined,batch=>sent.push(...batch)),/Falha temporária/);
  assert.deepEqual(sent,[files[0]]); assert.equal(calls,2);
});
