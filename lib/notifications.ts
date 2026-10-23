export type AppNotification = {
  id: string; title: string; meta: string; module: string; at: string;
  sourceId: string; category: "arrival" | "comment" | "task" | "chat" | "reminder" | "notice" | "agenda";
  targetUrl?: string; roomId?: string; count?: number;
};
type Item = {
  id: string; module: string; title: string; owner: string; team: string; record_type: string;
  description: string; created_at: string; updated_at: string; customer_id?: string | null;
  created_by?: string; assigned_at?: string | null; assigned_by?: string;
};
export type NotificationData = {
  user: { email: string; displayName: string; department: string; permissions: Array<{screen:string;canView:boolean}> };
  items: Item[];
  customers?: Array<{id:string;owner:string;cs_owner?:string;support_owner?:string}>;
  access?: { employees: Array<{id:string;email:string;displayName:string;departmentName:string;departmentNames:string[]}>; users?:Array<{id:string;email:string;createdAt:string}> } | null;
  internalChatModule?: {currentUserId:string;rooms:Array<{id:string;name:string;unreadCount:number;lastMessageAt:string;messages:Array<{id:string;senderUserId:string;senderName:string;body:string;type:string;createdAt:string}>}>} | null;
  taskModule?: { notifications:Array<{id:string;taskId:string;eventType:string;message:string;read:boolean;createdAt:string}>; tasks:Array<{id:string;assigneeUserId:string|null;assigneeName:string}>;collaborators:Array<{id:string;email:string}> } | null;
  noticesModule?: {notices:Array<{id:string;title:string;kind:string;authorUserId:string;active:boolean;visibleToCurrentUser:boolean;isRead:boolean;publishedAt:string}>} | null;
  agendaModule?: {collaborators:Array<{id:string;email:string}>;commitments:Array<{id:string;title:string;startsAt:string;responsibleUserId:string;responsibleName:string;participantUserIds:string[];statusName:string}>} | null;
  suggestionModule?: {suggestions:Array<{id:string;name:string;responsibleName:string;comments:Array<{id:string;authorName:string;createdAt:string;body:string}>}>} | null;
};
const normalize=(value:unknown)=>String(value??"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const string=(value:unknown)=>typeof value==="string"?value:"";
const array=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const parse=(value:string)=>{try{return object(JSON.parse(value))}catch{return {}}};
const validDate=(value:string)=>Number.isFinite(Date.parse(value));
const isComment=(entry:Record<string,unknown>,collection:string)=>{
  if(collection==="comments"||collection==="bugReports")return true;
  const type=normalize(entry.kind||entry.type);
  if(type)return /coment|follow.?up|feedback|observa|interacao/.test(type);
  return collection==="interactions";
};
function targetUrl(item:Item,detail:Record<string,unknown>){
  const params=new URLSearchParams({mod:item.module,card:item.id});
  if(item.module==="cs")params.set("csFlow",detail.kind==="enterpriseNetwork"?"enterprise":detail.track==="retention"?"evolution":"onboarding");
  if(item.module==="commercial") {params.set("commercialFlow",/retencao/.test(normalize(item.record_type))?"retention":"crm");params.set("lead",item.id)}
  if(item.module==="cancellations")params.set("cancellation",item.id);
  return `/?${params}`;
}
export function buildNotifications(data:NotificationData,now:number):AppNotification[]{
  const entries:AppNotification[]=[];
  const self=new Set([normalize(data.user.email),normalize(data.user.displayName)]);
  const employee=data.access?.employees.find(entry=>normalize(entry.email)===normalize(data.user.email));
  const userId=data.internalChatModule?.currentUserId||employee?.id||data.agendaModule?.collaborators.find(entry=>normalize(entry.email)===normalize(data.user.email))?.id||data.taskModule?.collaborators.find(entry=>normalize(entry.email)===normalize(data.user.email))?.id;
  if(userId)self.add(normalize(userId));
  const isSelf=(value:unknown)=>Boolean(value)&&self.has(normalize(value));
  const canView=(screen:string)=>data.user.permissions.some(permission=>permission.screen===screen&&permission.canView);
  const employees=data.access?.employees??[];
  const userNames=new Set(employees.flatMap(entry=>[normalize(entry.email),normalize(entry.displayName)]));
  const departments=new Set([data.user.department,...(employee?.departmentNames??[])].map(normalize).filter(Boolean));
  const owns=(owner:unknown)=>isSelf(owner);
  const receives=(item:Item)=>owns(item.owner)||(!userNames.has(normalize(item.owner))&&(!item.owner||/^(fila|triagem|coordenacao|nao atribuido|sem responsavel)/.test(normalize(item.owner)))&&(departments.has(normalize(item.team))||/^(fila|triagem|coordenacao)/.test(normalize(item.owner))));
  const labels:Record<string,string>={cs:"Acompanhamento",lia:"Acompanhamento LIA",waitingQueue:"Fila de espera",cancellations:"Cancelamentos",marketing:"Gestão de marketing",ti:"Desenvolvimento",serviceRequests:"Chamados",serviceFollowup:"Acompanhamento de chamados",commercial:"CRM",customers:"Clientes",admin:"Processo seletivo",hr:"Gestão RH",support:"Atendimentos",goals:"Metas",referrals:"Indicações"};
  const registeredAt=data.access?.users?.find(user=>isSelf(user.email))?.createdAt;
  const add=(entry:AppNotification)=>{if(canView(entry.module)&&validDate(entry.at)&&(!registeredAt||Date.parse(entry.at)>=Date.parse(registeredAt)))entries.push(entry)};
  for(const item of data.items){
    if(!canView(item.module)||item.module==="internalChat"||item.module==="reminders")continue;
    const detail=parse(item.description);
    const url=targetUrl(item,detail);
    const assignmentAt=item.assigned_at||item.created_at;
    const incomingFrom=item.assigned_at?item.assigned_by:item.created_by;
    const arrivalAllowed=(item.module==="cs"&&detail.kind!=="enterpriseNetwork"&&detail.kind!=="csSettings")
      ||["waitingQueue","cancellations","lia","serviceRequests","serviceFollowup"].includes(item.module)
      ||(item.module==="marketing"&&detail.kind==="marketingRequest")
      ||(item.module==="ti"&&detail.kind==="developmentTask");
    if(arrivalAllowed&&receives(item)&&!isSelf(incomingFrom))add({id:`arrival-${item.id}-${item.assigned_at||"created"}`,sourceId:item.id,category:"arrival",title:`${item.title} chegou para você`,meta:item.module==="cs"?(detail.track==="retention"?"Acompanhamento Retenção":"Acompanhamento Ativação"):labels[item.module]||item.module,module:item.module,at:assignmentAt,targetUrl:url});
    if(detail.kind==="enterpriseNetwork"&&receives(item))for(const value of array(detail.units)){
      const unit=object(value),unitId=string(unit.id);if(!unitId)continue;
      const history=array(detail.history).map(object).find(entry=>entry.unitId===unitId&&/cadastro|vincul|direcion/.test(normalize(entry.type||entry.kind||entry.text)));
      const actor=history?.user||history?.author||history?.actor||unit.createdBy;
      if(isSelf(actor))continue;
      add({id:`network-${item.id}-${unitId}`,sourceId:item.id,category:"arrival",title:`${string(unit.name)||"Cliente"} direcionado para ${item.title}`,meta:"Contas estratégicas",module:"cs",at:string(history?.createdAt||history?.at||unit.createdAt||unit.implementationAt)||item.created_at,targetUrl:url});
    }
    let responsible=item.owner;
    if(item.record_type==="Comentário do cliente")responsible=data.customers?.find(customer=>customer.id===item.customer_id)?.owner||responsible;
    if(item.module==="admin"&&detail.processId)responsible=data.items.find(parent=>parent.id===detail.processId)?.owner||responsible;
    if(!owns(responsible))continue;
    const visit=(node:Record<string,unknown>,path:string,depth:number)=>{
      if(depth>4)return;
      for(const [key,value] of Object.entries(node)){
        if(key==="history"&&array(node.comments).length)continue;
        if(["comments","follows","history","interactions","bugReports"].includes(key)&&Array.isArray(value))value.forEach((raw,index)=>{
          const entry:Record<string,unknown>=typeof raw==="string"?{text:raw}:object(raw);
          if(!isComment(entry,key))return;
          const author=entry.authorUserId||entry.authorName||entry.author||entry.by||entry.user||entry.actor||entry.createdBy;
          if(isSelf(author))return;
          const text=string(entry.text||entry.body||entry.comment);if(!text)return;
          const at=string(entry.createdAt||entry.at||entry.date)||item.created_at;
          if(Date.parse(at)<Date.parse(item.created_at))return;
          const identity=string(entry.id)||string(entry.createdAt||entry.at)||String(index);
          add({id:`comment-${item.id}-${path}${key}-${identity}`,sourceId:item.id,category:"comment",title:`Novo comentário em ${item.title}`,meta:`${labels[item.module]||item.module} · ${string(author)||"Comentário"}: ${text.slice(0,160)}`,module:item.module,at,targetUrl:url});
        });
        else if(["units","details","onboarding"].includes(key)) {if(Array.isArray(value))value.forEach((entry,index)=>visit(object(entry),`${path}${key}.${string(object(entry).id)||index}.`,depth+1));else visit(object(value),`${path}${key}.`,depth+1)}
      }
    };
    visit(detail,"",0);
  }
  for(const notification of data.taskModule?.notifications??[]){
    const task=data.taskModule?.tasks.find(task=>task.id===notification.taskId);
    if(notification.read||!["assigned","transferred","comment_added"].includes(notification.eventType)||!task||!(owns(task.assigneeUserId)||owns(task.assigneeName)))continue;
    add({id:`task-${notification.id}`,sourceId:notification.taskId,category:"task",title:notification.message,meta:"Tarefa",module:"tasks",at:notification.createdAt,targetUrl:`/?mod=tasks&task=${encodeURIComponent(notification.taskId)}`});
  }
  for(const room of data.internalChatModule?.rooms??[]){
    const incoming=room.messages.filter(message=>!isSelf(message.senderUserId));const latest=incoming.at(-1);
    if(room.unreadCount<=0)continue;
    add({id:`chat-${room.id}-${latest?.id||`unread-${room.unreadCount}`}`,sourceId:room.id,category:"chat",title:`${room.unreadCount} nova(s) mensagem(ns) em ${room.name}`,meta:"Chat interno",module:"internalChat",at:latest?.createdAt||room.lastMessageAt,roomId:room.id,count:room.unreadCount});
  }
  for(const notice of data.noticesModule?.notices??[])if(notice.active&&notice.visibleToCurrentUser&&!notice.isRead&&!isSelf(notice.authorUserId))add({id:`notice-${notice.id}`,sourceId:notice.id,category:"notice",title:notice.title,meta:notice.kind,module:"notices",at:notice.publishedAt});
  for(const item of data.items.filter(item=>item.module==="reminders")){
    const detail=parse(item.description),at=string(detail.nextAlertAt||detail.remindAt);
    if(detail.kind!=="systemReminder"||!isSelf(detail.recipientEmail)||detail.seenAt||!validDate(at)||Date.parse(at)>now)continue;
    add({id:`reminder-${item.id}-${at}`,sourceId:item.id,category:"reminder",title:string(detail.title)||item.title,meta:`Lembrete · ${string(detail.urgency)||"Aviso"}`,module:"reminders",at});
  }
  for(const commitment of data.agendaModule?.commitments??[]){
    const minutes=(Date.parse(commitment.startsAt)-now)/60_000;
    if(minutes<0||minutes>30||/cancel|conclu|finaliz/.test(normalize(commitment.statusName))||normalize(commitment.title).startsWith("[bloqueio comercial]"))continue;
    if(!owns(commitment.responsibleUserId)&&!owns(commitment.responsibleName)&&!commitment.participantUserIds.some(owns))continue;
    add({id:`agenda-${commitment.id}-${commitment.startsAt}`,sourceId:commitment.id,category:"agenda",title:`${commitment.title} começa em até 30 minutos`,meta:"Agenda",module:"work",at:commitment.startsAt});
  }
  for(const suggestion of data.suggestionModule?.suggestions??[])if(owns(suggestion.responsibleName))for(const comment of suggestion.comments){
    if(isSelf(comment.authorName))continue;
    add({id:`comment-suggestion-${comment.id}`,sourceId:suggestion.id,category:"comment",title:`Novo comentário em ${suggestion.name}`,meta:`Sugestões · ${comment.authorName}: ${comment.body.slice(0,160)}`,module:"suggestions",at:comment.createdAt,targetUrl:`/?mod=suggestions&card=${encodeURIComponent(suggestion.id)}`});
  }
  return [...new Map(entries.map(entry=>[entry.id,entry])).values()].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
}

export function newlyReceived(previous:Iterable<string>,notifications:AppNotification[],dismissed:ReadonlySet<string>){
  const known=new Set(previous);return notifications.filter(entry=>!known.has(entry.id)&&!dismissed.has(entry.id));
}

export function ownMutationNotificationIds(before:AppNotification[],after:AppNotification[],payload:Record<string,unknown>,createdId?:string){
  const previous=new Set(before.map(entry=>entry.id));const sources=new Set([payload.id,payload.strategicNetworkId,createdId].filter(Boolean));
  return after.filter(entry=>!previous.has(entry.id)&&sources.has(entry.sourceId)&&["arrival","comment"].includes(entry.category)).map(entry=>entry.id);
}
