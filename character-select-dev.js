(()=>{
let choice='';
let lastState=null;
const getSocket=()=>window.freshPingSocket||window.FRESH_NET?.socket||null;
const getSide=()=>window.FRESH_NET?.seat==='joiner'?'top':'bottom';

function installModeTransport(){
  const s=getSocket(); if(!s||s.__pingCharacterModeTransport)return false;
  const base=s.emit.bind(s);
  s.emit=function(event,...args){
    if(event==='createRoom'){
      const data=(args[0]&&typeof args[0]==='object')?{...args[0]}:{};
      data.characterMode=window.PING_CHARACTERS_MODE==='on'?'on':'off';
      args[0]=data;
    }
    return base(event,...args);
  };
  s.__pingCharacterModeTransport=true;
  return true;
}
function init(){
  if(document.getElementById('characterChoice'))return;
  const style=document.createElement('style');
  style.textContent=`#characterChoice{position:fixed;inset:0;z-index:22000;display:none;align-items:center;justify-content:center;background:#07111ee8;font-family:Arial,sans-serif}#characterChoice.open{display:flex}.ccPanel{background:#10253c;color:white;padding:22px;border-radius:18px;width:min(1100px,94vw);box-shadow:0 15px 45px #000a}.ccTitle{text-align:center;font-size:28px;font-weight:900;margin-bottom:20px}.ccRows{display:flex;justify-content:center;gap:38px}.ccPick{padding:12px;border:3px solid transparent;border-radius:14px;cursor:pointer}.ccPick:hover{background:#ffffff12}.ccPick.on{border-color:#f4d23d;background:#ffffff18}.ccCards{display:flex;gap:9px}.ccCards img{height:290px;width:auto;border-radius:8px;box-shadow:0 5px 14px #0008}.ccName{text-align:center;font-size:18px;font-weight:900;margin-top:9px}.ccOk{display:block;margin:22px auto 0;padding:11px 25px;border:0;border-radius:9px;font-size:16px;font-weight:900;cursor:pointer}.ccOk:disabled{opacity:.35}@media(max-width:900px){.ccRows{gap:12px}.ccCards img{height:210px}}`;
  document.head.appendChild(style);
  document.body.insertAdjacentHTML('beforeend',`<div id="characterChoice"><div class="ccPanel"><div class="ccTitle">Choisissez votre personnage</div><div class="ccRows"><div class="ccPick" data-c="mathieu"><div class="ccCards"><img src="/mathieu_verso.png"><img src="/mathieu_recto.png"></div><div class="ccName">Mathieu Livain</div></div><div class="ccPick" data-c="jeanne"><div class="ccCards"><img src="/jeanne_verso.png"><img src="/jeanne_recto.png"></div><div class="ccName">Jeanne Dori</div></div></div><button id="characterChoiceOk" class="ccOk" disabled>Valider mon personnage</button></div></div>`);
  document.querySelectorAll('.ccPick').forEach(x=>x.onclick=()=>{choice=x.dataset.c;document.querySelectorAll('.ccPick').forEach(y=>y.classList.toggle('on',y===x));document.getElementById('characterChoiceOk').disabled=false;});
  document.getElementById('characterChoiceOk').onclick=()=>{const n=window.FRESH_NET;if(choice&&n?.room)getSocket()?.emit('freshChooseCharacter',{room:n.room,character:choice});};
}
function sync(st){
  if(st) lastState=st;
  st=st||lastState;
  if(!st||st.characterMode!=='on'){document.getElementById('characterChoice')?.classList.remove('open');return;}
  const side=getSide();
  if(!st.characters||!Object.prototype.hasOwnProperty.call(st.characters,side))return;
  const chosen=st.characters[side];
  document.body.dataset.pingCharacter=chosen||'';
  if(chosen)document.getElementById('characterChoice')?.classList.remove('open');
  else if(document.body.classList.contains('fresh-game-ready'))document.getElementById('characterChoice')?.classList.add('open');
}
window.addEventListener('load',()=>{
  init();
  if(!installModeTransport()){const t=setInterval(()=>{if(installModeTransport())clearInterval(t)},25);}
  const s=getSocket();
  if(s&&typeof s.onAny==='function')s.onAny((e,p)=>{if(p?.state)sync(p.state)});
  if(s)s.on('freshCharacterChosen',p=>{if(p?.state)sync(p.state)});
  new MutationObserver(()=>{if(document.body.classList.contains('fresh-game-ready'))sync(lastState)}).observe(document.body,{attributes:true,attributeFilter:['class']});
});
})();