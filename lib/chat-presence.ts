export type ChatPresence = {userId:string;isOnline:boolean;lastSeenAt:string|null};
export function userIsOnline(user:{isOnline?:boolean;lastSeenAt?:string|null},_now:number){
  // The server tracks the system connection, including background tabs and reconnects.
  // Browser clock drift or a delayed render must not override that status.
  return user.isOnline===true;
}
export function applyChatPresence<T extends {users:Array<{id:string;isOnline?:boolean;lastSeenAt?:string|null}>}>(module:T,presence:ChatPresence[]):T {
  const byId=new Map(presence.map(entry=>[entry.userId,entry]));let changed=false;
  const users=module.users.map(user=>{const next=byId.get(user.id);if(!next||user.isOnline===next.isOnline&&user.lastSeenAt===next.lastSeenAt)return user;
    if(user.lastSeenAt&&next.lastSeenAt&&Date.parse(next.lastSeenAt)<Date.parse(user.lastSeenAt))return user;
    changed=true;return{...user,isOnline:next.isOnline,lastSeenAt:next.lastSeenAt};});
  return changed?{...module,users}:module;
}
