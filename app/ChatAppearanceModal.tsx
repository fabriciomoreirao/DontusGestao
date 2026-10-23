"use client";

import { Check, CheckCheck, ImagePlus, Palette, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { CHAT_PRESETS, DEFAULT_CHAT_APPEARANCE, chatAppearanceKey, chatAppearanceStyle, type ChatAppearance } from "@/lib/chat-appearance";

async function wallpaper(file:File){
  if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("Escolha uma imagem PNG, JPG ou WebP.");
  if(file.size>5*1024*1024)throw new Error("Escolha uma imagem de até 5 MB.");
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;await image.decode();
    const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext("2d");if(!context)throw new Error("Não foi possível preparar a imagem.");
    context.fillStyle="#efeae2";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    const result=canvas.toDataURL("image/jpeg",.82);if(result.length>2_000_000)throw new Error("Use uma imagem menor para o fundo do chat.");return result;
  }finally{URL.revokeObjectURL(url)}
}

export default function ChatAppearanceModal({appearance,userId,onSave,onClose}:{appearance:ChatAppearance;userId:string;onSave:(value:ChatAppearance)=>void;onClose:()=>void}){
  const [draft,setDraft]=useState(appearance);const [error,setError]=useState("");const [uploading,setUploading]=useState(false);const fileInput=useRef<HTMLInputElement>(null);
  const dark=typeof document!=="undefined"&&Boolean(document.querySelector(".theme-dark"));
  const defaults=CHAT_PRESETS[dark?1:0];
  const previewStyle={...chatAppearanceStyle({...draft,backgroundColor:draft.backgroundColor||defaults.backgroundColor,receivedColor:draft.receivedColor||defaults.receivedColor,sentColor:draft.sentColor||defaults.sentColor}),"--chat-wallpaper":draft.backgroundImage?`url("${draft.backgroundImage}")`:"var(--chat-pattern)","--chat-wallpaper-size":draft.backgroundImage?"cover":"320px"} as CSSProperties;
  const save=()=>{try{localStorage.setItem(chatAppearanceKey(userId),JSON.stringify(draft));onSave(draft);onClose()}catch{setError("Não foi possível salvar. Remova a imagem ou escolha uma imagem menor.")}};
  const fields=([['backgroundColor','Fundo da conversa'],['receivedColor','Mensagens recebidas'],['sentColor','Mensagens enviadas']] as const);
  return <div className="modal-backdrop chat-appearance-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><section className="modal chat-appearance-modal" role="dialog" aria-modal="true" aria-labelledby="chat-appearance-title">
    <header className="modal-head"><div><span className="eyebrow">CHAT INTERNO · APARÊNCIA</span><h2 id="chat-appearance-title"><Palette size={22}/>Deixe o chat do seu jeito</h2><p>Escolha um fundo e as cores das suas conversas.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar personalização"><X size={20}/></button></header>
    <div className="chat-appearance-body"><div className="chat-appearance-controls"><fieldset><legend>Escolha um estilo</legend><div className="chat-appearance-presets">{CHAT_PRESETS.map(preset=><button type="button" key={preset.name} className={draft.backgroundColor===preset.backgroundColor&&draft.sentColor===preset.sentColor?"selected":""} onClick={()=>setDraft({...preset,backgroundImage:draft.backgroundImage})}><span style={{background:preset.backgroundColor}}><i style={{background:preset.receivedColor}}/><i style={{background:preset.sentColor}}/></span><b>{preset.name}</b>{draft.backgroundColor===preset.backgroundColor&&draft.sentColor===preset.sentColor&&<Check size={14}/>}</button>)}</div></fieldset>
      <fieldset><legend>Personalizar cores</legend><div className="chat-appearance-colors">{fields.map(([key,label])=><label key={key}><span>{label}</span><span className="chat-color-input"><input type="color" aria-label={label} value={draft[key]||defaults[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})}/><code>{draft[key]||defaults[key]}</code></span></label>)}</div></fieldset>
      <fieldset><legend>Imagem de fundo</legend><input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={async event=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;setError("");setUploading(true);try{setDraft(current=>({...current,backgroundImage:""}));const image=await wallpaper(file);setDraft(current=>({...current,backgroundImage:image}))}catch(caught){setError(caught instanceof Error?caught.message:"Não foi possível abrir a imagem.")}finally{setUploading(false)}}}/><button className="chat-wallpaper-upload" type="button" disabled={uploading} onClick={()=>fileInput.current?.click()}><ImagePlus size={23}/><span><strong>{uploading?"Preparando imagem…":draft.backgroundImage?"Trocar imagem de fundo":"Escolher imagem de fundo"}</strong><small>PNG, JPG ou WebP · até 5 MB</small></span></button>{draft.backgroundImage&&<button className="chat-remove-wallpaper" type="button" onClick={()=>setDraft({...draft,backgroundImage:""})}><Trash2 size={14}/>Remover imagem</button>}</fieldset>
      <p className="chat-appearance-storage">Preferência pessoal, salva neste navegador. O fundo do restante do sistema continua como você configurou.</p>
    </div><div className="chat-appearance-preview" style={previewStyle}><header><span className="chat-preview-avatar">D</span><span><strong>Prévia da conversa</strong><small>Veja como suas mensagens ficam</small></span></header><div className="chat-preview-wallpaper"><span className="chat-preview-day">HOJE</span><div className="chat-preview-bubble received">Olá! Como posso ajudar?<time>09:41</time></div><div className="chat-preview-bubble sent">Tudo certo! Ficou do meu jeito. 😊<time>09:42 <CheckCheck size={13}/></time></div><div className="chat-preview-bubble received">Seu fundo e suas cores aparecem aqui.<time>09:42</time></div></div></div></div>
    {error&&<p className="chat-appearance-error" role="alert">{error}</p>}<footer className="modal-actions"><button type="button" className="chat-appearance-reset" onClick={()=>setDraft({...DEFAULT_CHAT_APPEARANCE})}><RotateCcw size={15}/>Restaurar padrão</button><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="button" className="primary-button" disabled={uploading} onClick={save}><Save size={16}/>Salvar aparência</button></footer>
  </section></div>;
}
