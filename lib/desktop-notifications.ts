type BadgeNavigator = Navigator & { setAppBadge?:(count:number)=>Promise<void>; clearAppBadge?:()=>Promise<void> };
let registration:Promise<ServiceWorkerRegistration|undefined>|undefined;
export function registerDesktopWorker() {
  if (typeof window === "undefined" || !window.isSecureContext || !("serviceWorker" in navigator)) return Promise.resolve(undefined);
  return registration ??= navigator.serviceWorker.register("/sw.js", {scope:"/",updateViaCache:"none"}).then(async worker=>{
    const installing=worker.installing??worker.waiting;
    if(!worker.active&&installing)await new Promise<void>(resolve=>{
      const timeout=window.setTimeout(done,10_000);
      function done(){window.clearTimeout(timeout);installing?.removeEventListener("statechange",changed);resolve();}
      function changed(){if(installing?.state==="activated"||installing?.state==="redundant")done();}
      installing.addEventListener("statechange",changed);changed();
    });
    return worker.active?worker:undefined;
  }).catch(()=>{registration=undefined;return undefined;});
}
export async function updateDesktopBadge(count:number) {
  const nav=navigator as BadgeNavigator;
  try { if(count>0)await nav.setAppBadge?.(count);else await nav.clearAppBadge?.(); } catch { /* Unsupported platforms retain the in-app badge. */ }
}
export function safeNotificationUrl(value:string,origin:string) {
  try { const url=new URL(value,origin);return url.origin===origin?url.href:new URL("/",origin).href; } catch { return new URL("/",origin).href; }
}
export async function showDesktopNotification(title:string,body:string,tag:string,url:string) {
  if (!("Notification" in window) || Notification.permission!=="granted" || (document.visibilityState==="visible"&&document.hasFocus())) return;
  const destination=safeNotificationUrl(url,window.location.origin);
  const worker=await registerDesktopWorker();
  try {
    if(worker)await worker.showNotification(title,{body,tag,icon:"/icons/dontus-192.png",badge:"/icons/dontus-192.png",data:{url:destination}});
    else { const notification=new Notification(title,{body,tag,icon:"/icons/dontus-192.png"});notification.onclick=()=>{window.focus();window.location.assign(destination);notification.close();}; }
  } catch { /* Notification availability must not interrupt the operation. */ }
}
