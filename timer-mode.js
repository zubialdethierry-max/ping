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
   #pingTimerMode{margin-top:9px}.pingModeButtons button.pingGameModeSelected{background:rgba(230,45,45,.78)!important;color:#fff!important;border-color:rgba(255,255,255,.95)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.22)!important}.pingLobbyActions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px}.pingLobbyActions button{margin:0!important;width:100%;padding:8px!important}.ptLabel{font-size:10px;font-weight:900;letter-spacing:.8px;margin-bottom:5px}
   .ptSelect{width:100%;padding:9px 10px;border:2px solid #fff;border-radius:8px;background:rgba(230,45,45,.78);color:#fff;font-size:11px;font-weight:900;cursor:pointer}
   #pingBlitzMinutes{display:none;margin-top:6px}
   #pingTurnClock{position:fixed;z-index:17500;right:18px;top:50%;transform:translateY(-50%);display:none;
     min-width:112px;padding:8px 12px;border:3px solid #102c46;border-radius:12px;background:#fff;color:#102c46;
     font:900 14px Arial;text-align:center;box-shadow:0 4px 14px #0004}
   @media (max-width:1200px),(max-height:760px){
     #pingTurnClock.waiting{right:auto;left:12px;top:auto;bottom:12px;transform:none;min-width:96px;padding:6px 9px}
     #pingTurnClock.waiting .time{font-size:25px!important}
   }
   #pingTurnClock.on{display:block}#pingTurnClock .time{font-size:30px;line-height:1;margin-top:3px}
   #pingTurnClock.waiting{display:block;opacity:.42;filter:grayscale(1);background:#e5e8eb}
   #pingTurnClock.mine{background:#fff7c9}#pingTurnClock.danger .time{font-size:34px}
   #pingStress{position:fixed;inset:0;z-index:23000;display:none;align-items:center;justify-content:center;background:#07111ed9;font-family:Arial,sans-serif}
   #pingStress.open{display:flex}.psBox{width:min(520px,88vw);background:white;color:#102c46;border:5px solid #102c46;border-radius:20px;padding:26px;text-align:center;box-shadow:0 18px 55px #0008}
   .psTitle{font-size:32px;font-weight:1000;margin-bottom:10px}
   #pingBlitzClocks{position:fixed;z-index:17450;right:18px;top:50%;transform:translateY(-50%);display:none;gap:8px;flex-direction:column;width:150px;font-family:Arial,sans-serif}
   #pingBlitzClocks.on{display:flex}.blitzClock{border:3px solid #102c46;border-radius:12px;background:#fff;padding:8px 10px;text-align:center;box-shadow:0 4px 14px #0004}
   .blitzClock.inactive{opacity:.42;filter:grayscale(1);background:#e5e8eb}.blitzName{font-size:12px;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.blitzTime{font-size:28px;font-weight:1000;line-height:1.1;margin-top:3px}
   .blitzClock.active{opacity:1;filter:none}.blitzClock.mine.active{background:#fff7c9}
   .psText{font-size:18px;font-weight:800;line-height:1.35}.psTime{font-size:48px;font-weight:1000;margin:13px 0}.psOk{padding:11px 26px;border:0;border-radius:9px;background:#102c46;color:white;font-size:16px;font-weight:900;cursor:pointer}
  `;
  document.head.appendChild(style);
  const box=document.createElement('div');box.id='pingTimerMode';
  box.innerHTML='<div class="ptLabel">MODE DE TEMPS</div><select id="pingTimerSelect" class="ptSelect"><option value="off">SANS TIMER</option><option value="match_point_30">COUP DE STRESS — 30 S À LA BALLE DE MATCH</option><option value="full_60_30">CHRONO — 60 S / TOUR → 30 S À LA BALLE DE MATCH</option><option value="blitz">BLITZ — 5 OU 10 MIN / JOUEUR</option></select><select id="pingBlitzMinutes" class="ptSelect"><option value="5">BLITZ — 5 MINUTES</option><option value="10">BLITZ — 10 MINUTES</option></select>';
  const join=document.getElementById('freshShowJoin');host.insertBefore(box,join);
  /* La sélection du mode ne crée plus la partie immédiatement. */
  let selectedOpponent='human';
  const modes=[
   [document.getElementById('freshCreate'),'human'],
   [document.getElementById('freshCreateBotEasy'),'bot_easy'],
   [document.getElementById('freshCreateBotIntermediate'),'bot_intermediate']
  ];
  const paintMode=()=>modes.forEach(([b,v])=>b&&b.classList.toggle('pingGameModeSelected',v===selectedOpponent));
  modes.forEach(([b,v])=>{if(!b)return;b.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation();selectedOpponent=v;paintMode();},true);});
  paintMode();
  /* Même code visuel pour la sélection Personnages. */
  const paintCharacters=()=>{
   const off=document.getElementById('pingCharactersOff')||document.getElementById('freshCharactersOff')||[...host.querySelectorAll('button')].find(b=>/SANS PERSONNAGES/i.test(b.textContent||''));
   const on=document.getElementById('pingCharactersOn')||document.getElementById('freshCharactersOn')||[...host.querySelectorAll('button')].find(b=>/AVEC PERSONNAGES/i.test(b.textContent||''));
   const enabled=window.PING_CHARACTERS_MODE==='on';
   [off,on].forEach((b,i)=>{if(!b)return;b.style.setProperty('background',(i===1)===enabled?'rgba(230,45,45,.78)':'#fff','important');b.style.setProperty('color',(i===1)===enabled?'#fff':'#102c46','important');});
  };
  host.addEventListener('click',()=>requestAnimationFrame(paintCharacters));paintCharacters();
  const actions=document.createElement('div');actions.className='pingLobbyActions';
  const create=document.createElement('button');create.id='pingCreateConfigured';create.className='primary';create.type='button';create.textContent='CRÉER LA PARTIE';
  if(join){join.classList.remove('pingJoinButton');join.parentElement.insertBefore(actions,join);actions.append(create,join);}
  create.addEventListener('click',()=>{
   const name=document.getElementById('freshName')?.value.trim();if(!name)return alert('Entre ton prénom.');
   const s=socket();if(!s)return alert('Connexion au serveur indisponible.');
   window.freshBotMode=selectedOpponent!=='human';
   s.emit('createRoom',{name,opponentType:selectedOpponent,characterMode:(window.PING_CHARACTERS_MODE==='on'?'on':'off')});
  });
  window.PING_TIMER_MODE='off';
  const select=box.querySelector('#pingTimerSelect');
  const blitzSelect=box.querySelector('#pingBlitzMinutes');window.PING_BLITZ_MINUTES=5;
  select.onchange=()=>{window.PING_TIMER_MODE=select.value;blitzSelect.style.display=select.value==='blitz'?'block':'none';};
  blitzSelect.onchange=()=>{window.PING_BLITZ_MINUTES=Number(blitzSelect.value)||5;};
  const clock=document.createElement('div');clock.id='pingTurnClock';clock.innerHTML='<div class="who">COUP DE STRESS</div><div class="time">30 s</div>';document.body.appendChild(clock);
  const bc=document.createElement('div');bc.id='pingBlitzClocks';bc.innerHTML='<div class="blitzClock" data-side="top"><div class="blitzName">J2</div><div class="blitzTime">05:00</div></div><div class="blitzClock" data-side="bottom"><div class="blitzName">J1</div><div class="blitzTime">05:00</div></div>';document.body.appendChild(bc);
  const stress=document.createElement('div');stress.id='pingStress';stress.innerHTML='<div class="psBox"><div class="psTitle">COUP DE STRESS !</div><div class="psText">Un joueur est à un point de la victoire.<br>Vous avez désormais</div><div class="psTime">30 SECONDES</div><div class="psText">par tour de jeu.</div><button class="psOk" type="button">JOUER</button></div>';document.body.appendChild(stress);
  stress.querySelector('.psOk').onclick=()=>stress.classList.remove('open');
 }
 function transport(){
  const s=socket();if(!s||s.__pingTimerTransport)return false;
  const base=s.emit.bind(s);
  s.emit=function(event,...args){
   if(event==='createRoom'){const d=args[0]&&typeof args[0]==='object'?{...args[0]}:{};d.timerMode=window.PING_TIMER_MODE||'off';d.blitzMinutes=window.PING_BLITZ_MINUTES||5;args[0]=d;}
   return base(event,...args);
  };s.__pingTimerTransport=true;return true;
 }
 function removeLegacyNeutralConstraint(){
  document.querySelectorAll('#neutralConstraintToken').forEach(el=>el.remove());
 }
 function sync(st){if(st)lastState=st;removeLegacyNeutralConstraint();render();}
 function fmt(ms){const s=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(s/60),r=s%60;return String(m).padStart(2,'0')+':'+String(r).padStart(2,'0');}
 function renderBlitz(){
  const wrap=document.getElementById('pingBlitzClocks');if(!wrap)return;
  if(lastState?.timerMode!=='blitz'||!lastState?.blitz){wrap.className='';return;}
  wrap.className='on';const b=lastState.blitz,now=Date.now();
  const me=side(),other=me==='top'?'bottom':'top';
  for(const s of [other,me]){
   const wanted=s===me?1:0;
   const node=wrap.querySelector('[data-side="'+s+'"]');if(node)node.style.order=wanted;
   const el=wrap.querySelector('[data-side="'+s+'"]'),name=lastState.playerNames?.[s]||(s==='bottom'?'J1':'J2');
   let ms=Number(b.remaining?.[s])||0;if(b.activeSide===s&&b.startedAt)ms=Math.max(0,ms-(now-Number(b.startedAt)));
   el.querySelector('.blitzName').textContent=name;el.querySelector('.blitzTime').textContent=fmt(ms);
   el.className='blitzClock '+(b.activeSide===s?'active':'inactive')+(s===side()?' mine':'');
  }
  raf=requestAnimationFrame(render);
 }
 function render(){
  cancelAnimationFrame(raf);
  if(lastState?.timerMode==='blitz'){const tc=document.getElementById('pingTurnClock');if(tc)tc.className='';renderBlitz();return;}
  const bw=document.getElementById('pingBlitzClocks');if(bw)bw.className='';
  const el=document.getElementById('pingTurnClock'),t=lastState?.turnTimer;
  if(!el)return;
  const mode=lastState?.timerMode;
  if(!['match_point_30','full_60_30'].includes(mode)){el.className='';return;}
  const high=Math.max(Number(lastState?.matchScore?.top)||0,Number(lastState?.matchScore?.bottom)||0);
  const baseSeconds=high>=3?30:(mode==='full_60_30'?60:30);
  if(!t?.activeSide||!t?.deadline){
    el.className='waiting';
    el.querySelector('.who').textContent=high>=3?'EN ATTENTE':(mode==='full_60_30'?'CHRONO':'COUP DE STRESS');
    el.querySelector('.time').textContent=baseSeconds+' s';
    return;
  }
  const left=Math.max(0,Math.ceil((Number(t.deadline)-Date.now())/1000));
  const mine=t.activeSide===side();
  el.className='on'+(mine?' mine':'')+(left<=10?' danger':'');
  el.querySelector('.who').textContent=mine?'VOTRE TEMPS':'TEMPS ADVERSE';
  el.querySelector('.time').textContent=String(left).padStart(2,'0')+' s';
  raf=requestAnimationFrame(render);
 }
 function boot(){
  install();
  removeLegacyNeutralConstraint();
  const ntObs=new MutationObserver(()=>removeLegacyNeutralConstraint());
  ntObs.observe(document.body,{childList:true,subtree:true});
  if(!transport()){const q=setInterval(()=>{if(transport())clearInterval(q)},25);}
  const bind=()=>{
    const s=socket();
    if(!s)return false;
    if(!s.__pingTimerStateListener&&s.onAny){s.onAny((e,p)=>{if(p?.state)sync(p.state);if(e==='freshMatchPointTimerActivated')document.getElementById('pingStress')?.classList.add('open');if(e==='freshBlitzMatchLost'&&p?.message)alert(p.message);});s.__pingTimerStateListener=true;}
    return true;
  };
  if(!bind()){const q=setInterval(()=>{if(bind())clearInterval(q)},25);}
 }
 if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();