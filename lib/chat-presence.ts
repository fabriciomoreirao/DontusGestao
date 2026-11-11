export type ChatPresence = {userId:string;isOnline:boolean;lastSeenAt:string|null};
export function userIsOnline(user:{isOnline?:boolean;lastSeenAt?:string|null},now:number){
  return user.isOnline===true&&(!user.lastSeenAt||Number.isFinite(Date.parse(user.lastSeenAt))&&now-Date.parse(user.lastSeenAt)>=-5_000&&now-Date.parse(user.lastSeenAt)<75_000);
}
export function applyChatPresence<T extends {users:Array<{id:string;isOnline?:boolean;lastSeenAt?:string|null}>}>(module:T,presence:ChatPresence[]):T {
  const byId=new Map(presence.map(entry=>[entry.userId,entry]));let changed=false;
  const users=module.users.map(user=>{const next=byId.get(user.id);if(!next||user.isOnline===next.isOnline&&user.lastSeenAt===next.lastSeenAt)return user;changed=true;return{...user,isOnline:next.isOnline,lastSeenAt:next.lastSeenAt};});
  return changed?{...module,users}:module;
}
