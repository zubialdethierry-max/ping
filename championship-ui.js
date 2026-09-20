/* PING! — écran Championnat solo V1. Prototype visuel isolé du moteur de match. */
(()=>{
 const NAMES=['Vous','Lucas Morel','Emma Laurent','Nathan Dubois','Léa Martin','Hugo Bernard','Inès Robert','Théo Garcia'];
 function install(){
  if(document.getElementById('pingChampionship'))return;
  const style=document.createElement('style');
  style.textContent=`
  #pingChampionship{position:fixed;inset:0;z-index:21000;display:none;background:linear-gradient(145deg,#071522,#12334b);color:#fff;font-family:Arial,sans-serif;overflow:auto}
  #pingChampionship.open{display:block}.chWrap{width:min(1180px,94vw);margin:28px auto 50px}.chTop{display:flex;align-items:end;justify-content:space-between;margin-bottom:22px}.chTitle{font-size:38px;font-weight:1000;letter-spacing:.5px}.chSub{opacity:.75;font-weight:700}.chGrid{display:grid;grid-template-columns:1fr 1.25fr;gap:22px}.chCard{background:#102c46e8;border:1px solid #ffffff20;border-radius:18px;padding:20px;box-shadow:0 12px 32px #0005}.chCard h2{margin:0 0 15px;font-size:21px}.chMatch{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:12px 8px;border-bottom:1px solid #ffffff18;font-weight:800}.chMatch:last-child{border:0}.chMatch span:last-child{text-align:right}.chVs{opacity:.55;font-size:12px}.chHuman{background:#ffffff0d;border-radius:10px}.chTable{width:100%;border-collapse:collapse;font-size:14px}.chTable th{opacity:.65;font-size:11px;text-transform:uppercase;padding:7px 5px;border-bottom:1px solid #ffffff28}.chTable td{padding:10px 5px;border-bottom:1px solid #ffffff12;text-align:center}.chTable td:nth-child(2),.chTable th:nth-child(2){text-align:left}.chRank{font-weight:1000}.chYou td{background:#f4d23d18}.chActions{display:flex;gap:10px;margin-top:18px}.chBtn{border:0;border-radius:10px;padding:12px 18px;font-weight:900;cursor:pointer}.chPrimary{background:#f4d23d;color:#102235}.chSecondary{background:#fff;color:#102235}.chLaunchers{position:fixed;right:22px;bottom:150px;z-index:20999;display:flex;flex-direction:column;gap:8px}.chDev{border:1px solid #ffffff55;border-radius:10px;padding:11px 18px;background:#123b60;color:#fff;font-weight:900;cursor:pointer;box-shadow:0 4px 15px #0008;text-transform:uppercase}.chDev:disabled{opacity:.55;cursor:default}.chClose{position:absolute;right:18px;top:14px;border:0;background:transparent;color:#fff;font-size:28px;cursor:pointer}@media(max-width:800px){.chGrid{grid-template-columns:1fr}.chTitle{font-size:29px}}
  `;document.head.appendChild(style);
  document.body.insertAdjacentHTML('beforeend',`
   <div class="chLaunchers"><button class="chDev" id="chDev">Championnat</button><button class="chDev" disabled>Tournoi · bientôt</button></div>
   <section id="pingChampionship"><button class="chClose" id="chClose">×</button><div class="chWrap">
    <div class="chTop"><div><div class="chTitle">CHAMPIONNAT PING!</div><div class="chSub">Saison solo · 8 joueurs · Journée 1 / 7</div></div><div class="chSub">Premier à 4 points</div></div>
    <div class="chGrid">
     <div class="chCard"><h2>Journée 1</h2><div id="chMatches"></div><div class="chActions"><button class="chBtn chPrimary">Jouer mon match</button><button class="chBtn chSecondary" id="chSim">Simuler les autres matchs</button></div></div>
     <div class="chCard"><h2>Classement</h2><table class="chTable"><thead><tr><th>#</th><th>Joueur</th><th>J</th><th>G</th><th>P</th><th>+/-</th><th>Pts</th></tr></thead><tbody id="chStand"></tbody></table></div>
    </div>
   </div></section>`);
  const pairs=[[0,7],[1,6],[2,5],[3,4]];
  document.getElementById('chMatches').innerHTML=pairs.map(p=>`<div class="chMatch ${p.includes(0)?'chHuman':''}"><span>${NAMES[p[0]]}</span><b class="chVs">VS</b><span>${NAMES[p[1]]}</span></div>`).join('');
  document.getElementById('chStand').innerHTML=NAMES.map((n,i)=>`<tr class="${i===0?'chYou':''}"><td class="chRank">${i+1}</td><td>${n}</td><td>0</td><td>0</td><td>0</td><td>0</td><td><b>0</b></td></tr>`).join('');
  const panel=document.getElementById('pingChampionship');document.getElementById('chDev').onclick=()=>panel.classList.add('open');document.getElementById('chClose').onclick=()=>panel.classList.remove('open');
  document.getElementById('chSim').onclick=()=>alert('Le simulateur BOT contre BOT est prêt côté moteur. Le branchement des résultats réels sur cet écran arrive à l’étape suivante.');
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();