import assert from 'node:assert/strict';
import test from 'node:test';
import {messageLinks} from '../lib/message-links.ts';

test('links nas mensagens permanecem clicáveis sem perder texto, linhas e pontuação',()=>{
 const text='Consulte https://exemplo.test/pasta?q=1&x=2.\nOu (www.dontus.com.br), e https://example.test/A_(B).';
 const parts=messageLinks(text);assert.equal(parts.map(p=>p.text).join(''),text);
 assert.deepEqual(parts.filter(p=>p.href).map(p=>p.href),['https://exemplo.test/pasta?q=1&x=2','https://www.dontus.com.br/','https://example.test/A_(B)']);
});
test('texto não vira HTML e protocolos executáveis ou credenciais não ganham links',()=>{
 const text='<script>alert(1)</script> javascript:alert(1) data:text/html,abc https://user:pass@example.test www. erradohttps://example.test';
 const parts=messageLinks(text);assert.equal(parts.map(p=>p.text).join(''),text);assert.equal(parts.some(p=>p.href),false);
});
