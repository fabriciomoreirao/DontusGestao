export function commentSubmitButton(input:HTMLTextAreaElement):HTMLButtonElement|undefined {
  const composer=input.closest('[data-comment-composer]')??input.closest('form')??input.closest('.comment-input-field')?.parentElement;
  if(!composer)return;
  const candidates=[...composer.querySelectorAll<HTMLButtonElement>('button')].filter(button=>
    !button.closest('.comment-input-field,.task-comment-tools,.comment-attachment-list,.comment-editor')
    && Boolean(input.compareDocumentPosition(button)&Node.DOCUMENT_POSITION_FOLLOWING));
  const explicit=candidates.find(button=>button.dataset.commentSubmit==='true');
  return explicit??candidates.find(button=>{
    const label=(button.textContent||button.getAttribute('aria-label')||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return input.dataset.commentKind==='follow'?/registrar.*follow|adicionar.*follow/i.test(label):/comentar|registrar|adicionar|enviar|salvar|publicar/i.test(label);
  });
}
export function submitComment(input:HTMLTextAreaElement):boolean {
  const button=commentSubmitButton(input);
  if(!button||button.disabled)return false;
  if(button.type==='submit'&&button.form)button.form.requestSubmit(button);else button.click();
  return true;
}
