"use client";
import {useEffect} from "react";
import {submitComment} from "@/lib/comment-submit";
import {isCommentSubmitKey} from "@/lib/comment-enter";

// Only explicitly marked comment composers opt in. Shift+Enter keeps a new line.
export default function CommentEnterSupport(){
  useEffect(()=>{
    const submit=(event:KeyboardEvent)=>{
      if(!isCommentSubmitKey(event))return;
      const input=event.target;
      if(!(input instanceof HTMLTextAreaElement)||!input.hasAttribute("data-comment-input")||(!input.value.trim()&&!input.hasAttribute("data-comment-has-files")))return;
      if(submitComment(input)){event.preventDefault();event.stopPropagation();}
    };
    const pending=(event:Event)=>{const element=event.target;if(!(element instanceof Element))return;const composer=element.closest("[data-comment-composer]");if(composer?.querySelector('[data-comment-uploading="true"]')&&(event.type==="submit"||element.closest("button"))){event.preventDefault();event.stopPropagation();}};
    document.addEventListener("click",pending,true);document.addEventListener("submit",pending,true);
    document.addEventListener("keydown",submit,true);return()=>{document.removeEventListener("keydown",submit,true);document.removeEventListener("click",pending,true);document.removeEventListener("submit",pending,true);};
  },[]);
  return null;
}
