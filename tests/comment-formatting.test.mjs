import assert from 'node:assert/strict';
import test from 'node:test';
import {commentFormatting,toggleCommentBold} from '../lib/comment-formatting.ts';
import {joinComment,splitComment} from '../lib/comment-files.ts';

test('negrito envolve e remove apenas a seleção preservando espaços e quebras',()=>{
 const text='  Primeiro item\n\nSegundo destaque\n';
 const start=text.indexOf('destaque'),end=start+8;
 const bold=toggleCommentBold(text,start,end);
 assert.equal(bold.text,'  Primeiro item\n\nSegundo **destaque**\n');
 const unbold=toggleCommentBold(bold.text,bold.start,bold.end);assert.equal(unbold.text,text);
 assert.deepEqual(toggleCommentBold('abc',1,1),{text:'a****bc',start:3,end:3});
 assert.equal(toggleCommentBold('  palavra  ',0,11).text,'  **palavra**  ');
});
test('texto formatado preserva parágrafos, tabulações, números e conteúdo literal sem HTML',()=>{
 const text='  1. Primeiro **destaque**\n\n\t2. <script>texto</script> **outro\nparágrafo**\n';
 const parts=commentFormatting(text);
 assert.deepEqual(parts.filter(p=>p.bold).map(p=>p.text),['destaque','outro\nparágrafo']);
 assert.equal(parts.map(p=>p.text).join(''),text.replaceAll('**',''));
 assert.deepEqual(commentFormatting('**sem fechamento\n'),[{text:'**sem fechamento\n',bold:false}]);
});
test('anexos de comentários mantêm o texto formatado original sem expor metadados no editor',()=>{
 const text='  **Prioridade**\n\n    Item dois\n';
 const file={name:'teste.pdf',type:'application/pdf',size:4,dataUrl:'data:application/pdf;base64,dGVzdA=='};
 assert.deepEqual(splitComment(joinComment(text,[file])),{text,files:[file]});
});
