import assert from 'node:assert/strict';
import test from 'node:test';
import {uploadSuggestionFiles,downloadSuggestionFile} from '../lib/suggestion-files-proxy.ts';
import {sendSuggestionFiles,validateSuggestionFiles} from '../lib/suggestion-upload.ts';

test('sugestões encaminham imagens, vídeos e documentos em multipart válido com a sessão',async t=>{
 const files=[['tela.png','image/png'],['video.webm','video/webm'],['relatorio.pdf','application/pdf'],['planilha.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']];
 const form=new FormData();for(const [name,type]of files)form.append('files',new File(['conteudo'],name,{type}));
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(options.headers.get('x-local-session'),'session/token');
  const outgoing=new Request(url,options);const sent=(await outgoing.formData()).getAll('files');
  assert.deepEqual(sent.map(f=>[f.name,f.type]),files);assert.equal(await sent[0].text(),'conteudo');
  return Response.json({ids:['one','two','three','four']},{status:201});
 });
 const response=await uploadSuggestionFiles(new Request('http://localhost/api/suggestion-files?suggestionId=test',{method:'POST',body:form,headers:{cookie:'dontus_session=session%2Ftoken'}}));
 assert.equal(response.status,201);assert.equal((await response.json()).ids.length,4);
});
test('download de vídeo preserva intervalos e não divulga a sessão ao armazenamento externo',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(options.headers.get('range'),'bytes=0-3');
  if(++calls===1){assert.equal(options.headers.get('x-local-session'),'session');return new Response(null,{status:302,headers:{location:'https://storage.example.test/arquivo?sig=test'}})}
  assert.equal(options.headers.get('x-local-session'),null);assert.equal(options.headers.get('x-user-email'),null);
  return new Response('data',{status:206,headers:{'content-type':'video/webm','content-range':'bytes 0-3/100','accept-ranges':'bytes'}});
 });
 const result=await downloadSuggestionFile(new Request('http://localhost/file',{headers:{cookie:'dontus_session=session',range:'bytes=0-3'}}),'video');
 assert.equal(result.status,206);assert.equal(result.headers.get('content-range'),'bytes 0-3/100');assert.equal(await result.text(),'data');
});
test('falhas de autorização continuam visíveis sem virar sucesso ou erro genérico de conexão',async t=>{
 for(const status of [400,401,403]){
  const mock=t.mock.method(globalThis,'fetch',async()=>Response.json({detail:'Recusado'},{status}));
  const form=new FormData();form.append('files',new File(['x'],'a.pdf'));
  const result=await uploadSuggestionFiles(new Request('http://localhost/api/suggestion-files?suggestionId=id',{method:'POST',body:form}));
  assert.equal(result.status,status);assert.equal((await result.json()).detail,'Recusado');mock.mock.restore();
 }
});
test('reenvio mantém apenas arquivos pendentes e valida limites antes de iniciar',async t=>{
 assert.throws(()=>validateSuggestionFiles([{size:0}]));assert.throws(()=>validateSuggestionFiles(Array.from({length:11},()=>({size:1}))));assert.throws(()=>validateSuggestionFiles([{size:25*1024*1024+1}]));
 const files=[new File(['png'],'a.png'),new File(['pdf'],'b.pdf')];const sent=[];let calls=0;
 t.mock.method(globalThis,'fetch',async()=>++calls===1?Response.json({ok:true}):Response.json({detail:'Indisponível'},{status:503}));
 await assert.rejects(sendSuggestionFiles('suggestion',files,files=>sent.push(...files)),/Indisponível/);
 assert.deepEqual(sent,[files[0]]);assert.equal(calls,2);
});
