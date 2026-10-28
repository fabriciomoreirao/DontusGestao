export type ChatAppearance = { backgroundColor:string; receivedColor:string; sentColor:string; backgroundImage:string };
export const DEFAULT_CHAT_APPEARANCE:ChatAppearance={backgroundColor:"",receivedColor:"",sentColor:"",backgroundImage:""};
export const CHAT_PRESETS = [
  {name:"WhatsApp claro",backgroundColor:"#efeae2",receivedColor:"#ffffff",sentColor:"#d9fdd3"},
  {name:"WhatsApp escuro",backgroundColor:"#0b141a",receivedColor:"#202c33",sentColor:"#005c4b"},
  {name:"Azul Dontus",backgroundColor:"#edf4fb",receivedColor:"#ffffff",sentColor:"#d8edff"},
];
export const chatAppearanceKey=(userId:string)=>`dontus:chat-appearance:${userId}`;
const color=(value:unknown)=>typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value)?value:"";
export function parseChatAppearance(raw:string|null):ChatAppearance{
  try{const value=JSON.parse(raw||"{}");if(!value||typeof value!=="object")return {...DEFAULT_CHAT_APPEARANCE};
    return {backgroundColor:color(value.backgroundColor),receivedColor:color(value.receivedColor),sentColor:color(value.sentColor),backgroundImage:typeof value.backgroundImage==="string"&&value.backgroundImage.length<=2_000_000&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value.backgroundImage)?value.backgroundImage:""};
  }catch{return {...DEFAULT_CHAT_APPEARANCE}}
}
export function chatTextColor(background:string){
  const rgb=background.slice(1).match(/.{2}/g)?.map(value=>parseInt(value,16)/255)??[1,1,1];
  const channels=rgb.map(value=>value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4));
  const luminance=channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
  return luminance>.18?"#142824":"#f7fffb";
}
export function chatAppearanceStyle(appearance:ChatAppearance):Record<string,string>{
  const style:Record<string,string>={};
  if(appearance.backgroundColor)style["--chat-background"]=appearance.backgroundColor;
  if(appearance.receivedColor){style["--chat-received"]=appearance.receivedColor;style["--chat-received-text"]=chatTextColor(appearance.receivedColor)}
  if(appearance.sentColor){style["--chat-sent"]=appearance.sentColor;style["--chat-sent-text"]=chatTextColor(appearance.sentColor)}
  if(appearance.backgroundImage){style["--chat-wallpaper"]=`url("${appearance.backgroundImage}")`;style["--chat-wallpaper-size"]="cover"}
  return style;
}
