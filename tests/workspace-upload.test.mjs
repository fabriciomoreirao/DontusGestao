import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadWorkspaceFile, UPLOAD_CHUNK_BYTES } from '../lib/workspace-upload.ts';
import { workspaceFilesProxy } from '../lib/workspace-files-proxy.ts';

test('uploads a file larger than previous limits in bounded chunks and stores its URL',async t=>{
  const file=new File([new Uint8Array(UPLOAD_CHUNK_BYTES*4+17).fill(23)],'long.mp4',{type:'video/mp4'});
  let offset=0, attempts=0;const progress=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url==='/api/workspace-files'){const input=JSON.parse(options.body);assert.equal(input.size,file.size);assert.equal(input.sourceId,'source');return Response.json({id:'upload'})}
    if(url.endsWith('/complete')){assert.equal(offset,file.size);return Response.json({id:'upload',url:'/api/workspace-files/upload',size:file.size})}
    assert.ok(options.body.size<=UPLOAD_CHUNK_BYTES);assert.equal(Number(new URL(url,'http://local').searchParams.get('offset')),offset);
    if(++attempts===1)throw new Error('conexão interrompida');
    const bytes=new Uint8Array(await options.body.arrayBuffer());assert.equal(bytes[0],23);offset+=bytes.length;return Response.json({offset});
  });
  const saved=await uploadWorkspaceFile(file,{module:'marketing',sourceId:'source',onProgress:p=>progress.push(p)});
  assert.equal(saved.size,file.size);assert.equal(progress.at(-1),100);assert.equal(attempts,6);
});

test('upload proxy preserves streaming, authentication and byte ranges',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.ok(url.includes('/api/workspace-files/01234567-1234-1234-1234-123456789abc'));assert.equal(options.headers.get('x-local-session'),'token');assert.equal(options.headers.get('range'),'bytes=0-3');assert.equal(options.duplex,'half');
    assert.equal(await new Response(options.body).text(),'data');return new Response('file',{status:206,headers:{'content-range':'bytes 0-3/999','content-type':'video/mp4'}});
  });
  const result=await workspaceFilesProxy(new Request('http://localhost/api/workspace-files/id',{method:'PUT',headers:{cookie:'dontus_session=token',range:'bytes=0-3'},body:'data'}),['01234567-1234-1234-1234-123456789abc']);
  assert.equal(result.status,206);assert.equal(result.headers.get('content-range'),'bytes 0-3/999');
});
