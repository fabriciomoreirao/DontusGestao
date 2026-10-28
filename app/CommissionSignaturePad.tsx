"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Eraser, PenLine } from "lucide-react";

export type SignaturePoint = { x:number; y:number };
export type SignatureStroke = { points:SignaturePoint[] };

export default function CommissionSignaturePad({onChange,disabled}:{onChange:(strokes:SignatureStroke[])=>void;disabled:boolean}) {
  const canvas=useRef<HTMLCanvasElement>(null);const strokes=useRef<SignatureStroke[]>([]);const drawing=useRef<SignaturePoint[]|null>(null);const [hasInk,setHasInk]=useState(false);
  function position(event:PointerEvent<HTMLCanvasElement>){const rect=event.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
  function start(event:PointerEvent<HTMLCanvasElement>){if(disabled||event.button!==0||drawing.current||strokes.current.length>=50)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drawing.current=[position(event)];}
  function move(event:PointerEvent<HTMLCanvasElement>){if(!drawing.current||disabled)return;event.preventDefault();const points=drawing.current;if(points.length>=3000)return;const next=position(event);const previous=points[points.length-1];if(Math.hypot(next.x-previous.x,next.y-previous.y)<.001)return;points.push(next);const context=canvas.current?.getContext("2d");if(context){context.strokeStyle="#123f71";context.lineWidth=3;context.lineCap="round";context.lineJoin="round";context.beginPath();context.moveTo(previous.x*1000,previous.y*260);context.lineTo(next.x*1000,next.y*260);context.stroke();}}
  function finish(event:PointerEvent<HTMLCanvasElement>){if(!drawing.current)return;move(event);const points=drawing.current;drawing.current=null;if(points.length>=2){strokes.current=[...strokes.current,{points}];setHasInk(true);onChange(strokes.current);}if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
  function clear(){strokes.current=[];drawing.current=null;canvas.current?.getContext("2d")?.clearRect(0,0,1000,260);setHasInk(false);onChange([]);}
  return <section className="commission-signature-field"><header><span><PenLine size={17}/>Sua rubrica <b>*</b></span><button type="button" className="secondary-button" disabled={disabled||!hasInk} onClick={clear}><Eraser size={14}/>Limpar</button></header><p id="commission-signature-help">Desenhe sua rubrica com o mouse ou com o dedo dentro do quadro.</p><canvas ref={canvas} width={1000} height={260} aria-label="Quadro para desenhar sua rubrica" aria-describedby="commission-signature-help" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}/><small>A rubrica será incluída no documento com sua identidade e os dados desta confirmação.</small></section>;
}

export function CommissionSignatureImage({strokes}:{strokes:SignatureStroke[]}) {
  return <svg className="commission-signature-image" viewBox="0 0 1000 260" role="img" aria-label="Rubrica registrada pelo responsável">{strokes.map((stroke,index)=><polyline key={index} points={stroke.points.map(point=>`${point.x*1000},${point.y*260}`).join(" ")} fill="none" stroke="#123f71" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>)}</svg>;
}
