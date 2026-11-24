import { apiRequestSignal } from './api-request.ts';

export async function workspaceFilesProxy(request: Request, path: string[] = [], publicUpload=false) {
  if(path.length>2||path[0]&&!/^[0-9a-f-]{36}$/i.test(path[0])||path[1]&&path[1]!=='complete')return Response.json({detail:'Arquivo inválido.'},{status:400});
  const headers = new Headers(request.headers);
  for (const key of ['host','content-length','cookie']) headers.delete(key);
  const session = request.headers.get('cookie')?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if(session)headers.set('x-local-session',decodeURIComponent(session));
  headers.set('x-user-email',encodeURIComponent(request.headers.get('oai-authenticated-user-email')??process.env.LOCAL_USER_EMAIL??'gestor@dontus.local'));
  headers.set('x-user-name',encodeURIComponent(process.env.LOCAL_USER_NAME??'Gestor Dontus'));
  headers.set('x-user-role',encodeURIComponent(process.env.LOCAL_USER_ROLE??'Administrador técnico'));
  if(publicUpload){headers.delete('x-local-session');headers.set('x-api-key',process.env.PUBLIC_SERVICE_REQUESTS_API_KEY??'')}
  try {
    const response=await fetch(`${(process.env.API_INTERNAL_URL??'http://localhost:8080').replace(/\/$/,'')}/api/${publicUpload?'public-workspace-files':'workspace-files'}/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`,{
      method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,duplex:'half',cache:'no-store',signal:apiRequestSignal(request,300_000),
    } as RequestInit);
    const outgoing=new Headers(response.headers);outgoing.set('cache-control','private, no-store');
    outgoing.delete('content-encoding');
    return new Response(response.body,{status:response.status,headers:outgoing});
  }catch{return Response.json({detail:'Não foi possível acessar o armazenamento de arquivos. Tente novamente.'},{status:503})}
}
