"use client";
import {useCallback,useEffect,useRef,useState} from "react";
type Session={cancelled:boolean;stream?:MediaStream;recorder?:MediaRecorder;chunks:Blob[]};
export default function useVoiceRecorder(resetKey:string){
 const current=useRef<Session|null>(null),preview=useRef<string|null>(null);
 const [state,setState]=useState<"idle"|"requesting"|"recording"|"processing"|"ready">("idle");
 const [draft,setDraft]=useState<{file:File;url:string}|null>(null),[error,setError]=useState("");
 const release=useCallback(()=>{const session=current.current;current.current=null;if(session){session.cancelled=true;if(session.recorder?.state!=="inactive")session.recorder?.stop();session.stream?.getTracks().forEach(track=>track.stop())}if(preview.current){URL.revokeObjectURL(preview.current);preview.current=null}},[]);
 const cancel=useCallback(()=>{release();setDraft(null);setState("idle");setError("")},[release]);
 useEffect(()=>{cancel();return release},[resetKey,cancel,release]);
 const start=async()=>{
  if(current.current||draft)return;
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){setError("A gravação não está disponível neste navegador.");return}
  const session:Session={cancelled:false,chunks:[]};current.current=session;setError("");setState("requesting");
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});session.stream=stream;
   if(session.cancelled||current.current!==session){stream.getTracks().forEach(track=>track.stop());return}
   const mimeType=["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/webm"].find(type=>MediaRecorder.isTypeSupported(type));
   const recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);session.recorder=recorder;
   recorder.ondataavailable=event=>{if(!session.cancelled&&event.data.size)session.chunks.push(event.data);if(session.chunks.reduce((sum,chunk)=>sum+chunk.size,0)>50*1024*1024){cancel();setError("O áudio ultrapassou o limite de 50 MB.")}};
   recorder.onerror=()=>{cancel();setError("Não foi possível concluir a gravação. Tente novamente.")};
   recorder.onstop=()=>{stream.getTracks().forEach(track=>track.stop());if(session.cancelled||current.current!==session)return;current.current=null;
    const type=recorder.mimeType.split(";")[0]||"audio/webm";const blob=new Blob(session.chunks,{type});
    if(!blob.size){setState("idle");setError("O áudio ficou vazio. Grave novamente.");return}
    const file=new File([blob],`audio-${Date.now()}.${type.includes("ogg")?"ogg":type.includes("mp4")?"m4a":"webm"}`,{type});
    const url=URL.createObjectURL(file);preview.current=url;setDraft({file,url});setState("ready");
   };
   recorder.start(1000);setState("recording");
  }catch{if(current.current===session){release();setState("idle");setError("Permita o acesso ao microfone para gravar o áudio.")}}
 };
 const stop=()=>{if(current.current?.recorder?.state==="recording"){setState("processing");current.current.recorder.stop()}};
 return{state,draft,error,start,stop,cancel};
}
