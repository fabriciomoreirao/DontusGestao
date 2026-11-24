import assert from 'node:assert/strict';
import test from 'node:test';
import {publicRecruitmentProxy} from '../lib/public-recruitment-proxy.ts';

test('candidaturas públicas não exigem sessão nem consultam o snapshot privado',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const headers=new Headers(options.headers);
    assert.ok(url.endsWith('/api/public-recruitment/01234567-1234-1234-1234-123456789abc'));
    assert.equal(headers.get('cookie'),null);assert.equal(headers.get('x-local-session'),null);
    assert.ok(headers.has('x-api-key'));assert.equal(options.method,'POST');
    assert.deepEqual(JSON.parse(options.body),{name:'Candidato de teste'});
    return Response.json({id:'candidate'});
  });
  const response=await publicRecruitmentProxy(new Request('http://localhost/api/public-recruitment/id',{method:'POST',headers:{cookie:'dontus_session=secret'},body:JSON.stringify({name:'Candidato de teste'})}),'01234567-1234-1234-1234-123456789abc');
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('IDs públicos inválidos não alcançam a API',async t=>{
  t.mock.method(globalThis,'fetch',()=>{throw Error('Must not call API')});
  const response=await publicRecruitmentProxy(new Request('http://localhost/api/public-recruitment/invalid'),'../../operations');
  assert.equal(response.status,400);
});
