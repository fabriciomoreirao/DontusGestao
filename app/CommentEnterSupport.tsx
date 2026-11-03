"use client";
import {useEffect} from "react";
import {isCommentSubmitKey} from "@/lib/comment-enter";

// Only explicitly marked comment composers opt in. Shift+Enter keeps a new line.
export default function CommentEnterSupport(){
  useEffect(()=>{
    const submit=(event:KeyboardEvent)=>{
      if(!isCommentSubmitKey(event))return;
      const input=event.target;
      if(!(input instanceof HTMLTextAreaElement)||!input.hasAttribute("data-comment-input")||!input.value.trim())return;
      const composer=input.closest("[data-comment-composer]")??input.closest("form");
      if(!composer)return;
      const button=[...composer.querySelectorAll<HTMLButtonElement>("button")].find(button=>{
        if(button.disabled||!(input.compareDocumentPosition(button)&Node.DOCUMENT_POSITION_FOLLOWING))return false;
        const label=(button.textContent||button.getAttribute("aria-label")||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
        return input.dataset.commentKind==="follow"?/registrar.*follow|adicionar.*follow/i.test(label):/comentar|registrar|adicionar|enviar|salvar|publicar/i.test(label);
      });
      if(!button)return;
      event.preventDefault();event.stopPropagation();
      if(composer instanceof HTMLFormElement&&button.type==="submit")composer.requestSubmit(button);else button.click();
    };
    document.addEventListener("keydown",submit,true);return()=>document.removeEventListener("keydown",submit,true);
  },[]);
  return null;
}
