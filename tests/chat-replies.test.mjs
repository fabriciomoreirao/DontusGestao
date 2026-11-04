import test from 'node:test';
import assert from 'node:assert/strict';
import {chatReplyPreview} from '../lib/chat-replies.ts';
import {sendInternalChatFiles} from '../lib/internal-chat-upload.ts';

test('a citação mostra texto, anexo e enquete sem exibir JSON ou conteúdo excluído',()=>{
  const message={id:'1',senderName:'Ana',type:'text',body:'Mensagem original',fileName:''};
  assert.equal(chatReplyPreview(message),'Mensagem original');
  assert.equal(chatReplyPreview({...message,type:'image',fileName:'foto.png'}),'Imagem: foto.png');
  assert.equal(chatReplyPreview({...message,type:'poll',body:'{"question":"Confirmado?","options":[]}'}),'Enquete: Confirmado?');
  assert.equal(chatReplyPreview({...message,deletedAt:'2026-11-04'}),'Mensagem excluída');
  assert.equal(chatReplyPreview({...message,body:'a'.repeat(1000)}).length,240);
});

test('anexos enviados como resposta preservam o vínculo com a mensagem selecionada',async t=>{
  const fetch=t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(options.body.get('replyToMessageId'),'original');
    assert.equal(options.body.getAll('files')[0].name,'foto.png');
    return Response.json({ids:['answer']},{status:201});
  });
  await sendInternalChatFiles('room',[new File(['imagem'],'foto.png')],undefined,'original');
  assert.equal(fetch.mock.callCount(),1);
});
