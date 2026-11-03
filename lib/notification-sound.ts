let audio:AudioContext|undefined;
function context(){
  const Constructor=window.AudioContext||(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  return Constructor?(audio??=new Constructor()):undefined;
}
export function unlockNotificationSound(){try{const current=context();if(current?.state==="suspended")void current.resume().catch(()=>{});}catch{}}
export function playNotificationSound(queueArrival=false){
  try{
    const current=context();if(!current)return;
    const play=()=>{if(current.state!=="running")return;
    const delays=queueArrival?Array.from({length:5},(_,repeat)=>[repeat*.9,repeat*.9+.16,repeat*.9+.34]).flat():[0,.16];
    delays.forEach((delay,index)=>{
      const oscillator=current.createOscillator(),gain=current.createGain();oscillator.type="sine";oscillator.frequency.value=(queueArrival?index%3:index)%2===0?988:1318;
      gain.gain.setValueAtTime(.0001,current.currentTime+delay);gain.gain.exponentialRampToValueAtTime(queueArrival ? 0.14 : 0.09,current.currentTime+delay+.015);
      gain.gain.exponentialRampToValueAtTime(.0001,current.currentTime+delay+.2);oscillator.connect(gain).connect(current.destination);
      oscillator.start(current.currentTime+delay);oscillator.stop(current.currentTime+delay+.22);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    });};
    if(current.state==="suspended")void current.resume().then(play).catch(()=>{});else play();
  }catch{}
}
