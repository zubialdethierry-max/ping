/* PING! — interface commune des modes chronométrés.
   Étape 1 : Normal / Balle de match (30 s par tour, service gratuit). */
(()=>{
 let lastState=null,raf=0;
 const socket=()=>window.freshPingSocket||window.FRESH_NET?.socket||null;
 const side=()=>window.FRESH_NET?.seat==='joiner'?'top':'bottom';

 function install(){
  if(document.getElementById('pingTimerMode'))return;
  const host=document.getElementById('pingModeChoice');if(!host)return;
  const style=document.createElement('style');
  style.textContent=`
   #pingTimerMode{margin-top:9px}.ptLabel{font-size:10px;font-weight:900;letter-spacing:.8px;margin-bottom:5px}
   .ptChoices{display:flex;gap:5px}.ptChoices button{flex:1;padding:7px 5px;font-size:10px}
   .ptChosen{background:#fff!important;color:#102c46!important}
   #pingTurnClock{position:fixed;z-index:17500;right:18px;top:50%;transform:translateY(-50%);display:none;
     min-width:112px;padding:8px 12px;border:3px solid #102c46;border-radius:12px;background:#fff;color:#102c46;
     font:900 14px Arial;text-align:center;box-shadow:0 4px 14px #0004}
   #pingTurnClock.on{display:block}#pingTurnClock .time{font-size:30px;line-height:1;margin-top:3px}
   #pingTurnClock.mine{background:#fff7c9}#pingTurnClock.danger .time{font-size:34px}
  `;
  document.head.appendChild(style);
  const box=document.createElement('div');box.id='pingTimerMode';
  box.innerHTML='<div class="ptLabel">CHRONOMÈTRE</div><div class="ptChoices"><button type="button" data-t="off" class="secondary ptChosen">NORMAL</button><button type="button" data-t="match_point_30" class="secondary">BALLE DE MATCH · 30 S</button></div>';
  const join=document.getElementById('freshShowJoin');host.insertBefore(box,join);
  window.PING_TIMER_MODE='off';
  box.querySelectorAll('button').forEach(b=>b.onclick=()=>{window.PING_TIMER_MODE=b.dataset.t;box.querySelectorAll('button').forEach(x=>x.classList.toggle('ptChosen',x===b));});
  const clock=document.createElement('div');clock.id='pingTurnClock';clock.innerHTML='<div class="who"></div><div class="time">30</div>';document.body.appendChild(clock);
 }
 function transport(){
  const s=socket();if(!s||s.__pingTimerTransport)return false;
  const base=s.emit.bind(s);
  s.emit=function(event,...args){
   if(event==='createRoom'){const d=args[0]&&typeof args[0]==='object'?{...args[0]}:{};d.timerMode=window.PING_TIMER_MODE||'off';args[0]=d;}
   return base(event,...args);
  };s.__pingTimerTransport=true;return true;
 }
 function sync(st){if(st)lastState=st;render();}
 function render(){
  cancelAnimationFrame(raf);
  const el=document.getElementById('pingTurnClock'),t=lastState?.turnTimer;
  if(!el||lastState?.timerMode!=='match_point_30'||!t?.activeSide||!t?.deadline){if(el)el.className='';return;}
  const left=Math.max(0,Math.ceil((Number(t.deadline)-Date.now())/1000));
  const mine=t.activeSide===side();
  el.className='on'+(mine?' mine':'')+(left<=10?' danger':'');
  el.querySelector('.who').textContent=mine?'VOTRE TEMPS':'TEMPS ADVERSE';
  el.querySelector('.time').textContent=String(left).padStart(2,'0')+' s';
  raf=requestAnimationFrame(render);
 }
 function boot(){
  install();
  if(!transport()){const q=setInterval(()=>{if(transport())clearInterval(q)},25);}
  const bind=()=>{
    const s=socket();
    if(!s)return false;
    if(!s.__pingTimerStateListener&&s.onAny){s.onAny((e,p)=>{if(p?.state)sync(p.state);});s.__pingTimerStateListener=true;}
    return true;
  };
  if(!bind()){const q=setInterval(()=>{if(bind())clearInterval(q)},25);}
 }
 if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();